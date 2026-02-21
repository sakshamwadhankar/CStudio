/**
 * Preservation Property Tests
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * IMPORTANT: These tests MUST PASS on unfixed code - they confirm baseline behavior to preserve
 * 
 * GOAL: Verify that non-buggy inputs work correctly on unfixed code:
 * 1. Below-fold elements (rect.top > window.innerHeight * 0.3) animate correctly with GSAP
 * 2. Images without filter strings load correctly
 * 3. Pre-reveal phase works correctly (visibility forcing, element tagging)
 * 4. DOM capture works correctly (script injection, Phantom Engine)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1200;
const VIEWPORT_THRESHOLD = VIEWPORT_HEIGHT * 0.3; // 240px

/**
 * Get the UNFIXED captureScript from useAppSaveAllResource.js
 * This is the current implementation that we need to preserve for non-buggy inputs
 */
function getCaptureScript() {
  return `
    const liveBase = window.location.origin;
    
    // 1. BULLETPROOF MEDIA URLS
    document.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
      ['src', 'data-src', 'poster'].forEach(attr => {
        if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
          try { el.setAttribute(attr, new URL(el.getAttribute(attr), liveBase).href); } catch(e){}
        }
      });
    });
    
    // 2. THE ABSOLUTE NUKE
    document.querySelectorAll('script').forEach(script => {
      if (script.src && script.src.includes('visbug')) return;
      script.remove();
    });
    
    // 3. PRE-REVEAL & SCROLL UNLOCKER
    console.log('[CStudio] Executing Pre-Reveal & Scroll Unlock...');
    
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    
    const preRevealElements = document.querySelectorAll(
      '.opacity-0:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
      '[style*="opacity: 0"]:not([role="dialog"]):not([role="menu"]), ' +
      '[style*="visibility: hidden"]:not([role="dialog"]):not([role="menu"])'
    );
    preRevealElements.forEach(el => {
      if (el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) return;
      const computed = window.getComputedStyle(el);
      if (computed.display === 'none') return;
      
      el.classList.remove('opacity-0');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('transform', 'none', 'important');
      
      // Tag for Phantom Engine to know what to animate later
      el.classList.add('cstudio-animate-me');
    });
    
    // 4. THE PHANTOM ENGINE (Deferred Animation)
    const phantomScript = document.createElement('script');
    phantomScript.innerHTML = \`
      (function() {
        const s1 = document.createElement('script');
        s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
        document.body.appendChild(s1);
        
        const s2 = document.createElement('script');
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
        document.body.appendChild(s2);
        
        let checkCount = 0;
        const initGSAP = setInterval(() => {
          checkCount++;
          if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            clearInterval(initGSAP);
            gsap.registerPlugin(ScrollTrigger);
            
            const elementsToAnimate = document.querySelectorAll('.cstudio-animate-me');
            elementsToAnimate.forEach(el => {
              if (el.closest('.modal, [role="dialog"]')) return;
              
              gsap.fromTo(el, 
                { opacity: 0, y: 40 },
                {
                  opacity: 1,
                  y: 0,
                  duration: 1,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: el,
                    start: "top 90%",
                    toggleActions: "play none none none"
                  }
                }
              );
            });
            
            setTimeout(() => ScrollTrigger.refresh(), 500);
          } else if (checkCount > 50) {
            clearInterval(initGSAP);
          }
        }, 100);
      })();
    \`;
    document.body.appendChild(phantomScript);
    
    document.documentElement.outerHTML;
  `;
}

/**
 * Property 3: Below-Fold Animation Preservation
 * **Validates: Requirements 3.1**
 * 
 * For any element where rect.top > window.innerHeight * 0.3,
 * verify GSAP scroll-triggered animations work correctly on unfixed code
 */
async function testBelowFoldAnimationPreservation(browser) {
  console.log('\n=== Property 3: Below-Fold Animation Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Create test HTML with below-fold content
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Below-Fold Animation Test</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
    }
    .spacer {
      height: 600px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .below-fold-element {
      margin-top: 100px;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="spacer">
    <h1 style="color: white; padding: 50px;">Spacer Content</h1>
  </div>
  <div class="below-fold-element opacity-0" style="opacity: 0;">
    <h2>Below Fold Element</h2>
    <p>This element should be animated on scroll</p>
  </div>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-below-fold.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify element is below the fold
  const elementPosition = await page.evaluate(() => {
    const el = document.querySelector('.below-fold-element');
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      viewportHeight: window.innerHeight,
      threshold: window.innerHeight * 0.3,
      isBelowFold: rect.top > window.innerHeight * 0.3
    };
  });
  
  console.log('Element position:', elementPosition);
  
  if (!elementPosition.isBelowFold) {
    throw new Error(`Element is NOT below fold (top: ${elementPosition.top}px <= threshold: ${elementPosition.threshold}px)`);
  }
  
  console.log('✓ Element is correctly positioned below viewport threshold');
  
  // Execute captureScript
  console.log('\nExecuting captureScript on unfixed code...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save and load captured HTML
  const capturedFilePath = path.join(__dirname, 'captured-below-fold.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  await page.close();
  
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  
  // Wait for GSAP to load
  await capturedPage.waitForTimeout(2000);
  
  // Verify element is tagged for animation
  const animationSetup = await capturedPage.evaluate(() => {
    const el = document.querySelector('.below-fold-element');
    return {
      hasClass: el.classList.contains('cstudio-animate-me'),
      initialOpacity: window.getComputedStyle(el).opacity,
      gsapLoaded: typeof gsap !== 'undefined',
      scrollTriggerLoaded: typeof ScrollTrigger !== 'undefined'
    };
  });
  
  console.log('Animation setup:', animationSetup);
  
  // Scroll to trigger animation
  await capturedPage.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  
  await capturedPage.waitForTimeout(1500);
  
  // Check if animation triggered
  const afterScroll = await capturedPage.evaluate(() => {
    const el = document.querySelector('.below-fold-element');
    return {
      opacity: window.getComputedStyle(el).opacity,
      transform: window.getComputedStyle(el).transform
    };
  });
  
  console.log('After scroll:', afterScroll);
  
  // Clean up
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // Verify preservation: element should be tagged and GSAP should be loaded
  const passed = animationSetup.hasClass && 
                 animationSetup.gsapLoaded && 
                 animationSetup.scrollTriggerLoaded &&
                 parseFloat(afterScroll.opacity) > 0.5;
  
  if (passed) {
    console.log('\n✓ PRESERVATION VERIFIED: Below-fold animations work correctly on unfixed code');
    return { passed: true, property: 'Below-Fold Animation Preservation' };
  } else {
    console.log('\n❌ PRESERVATION FAILED: Below-fold animations not working as expected');
    return { 
      passed: false, 
      property: 'Below-Fold Animation Preservation',
      issue: 'Animation setup or execution failed'
    };
  }
}

/**
 * Property 4a: Normal Image Loading Preservation
 * **Validates: Requirements 3.4**
 * 
 * For images without filter strings, verify they load correctly on unfixed code
 */
async function testNormalImageLoadingPreservation(browser) {
  console.log('\n=== Property 4a: Normal Image Loading Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Create test HTML with normal image (no filter strings)
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Normal Image Test</title>
</head>
<body>
  <h1>Normal Image Loading Test</h1>
  <img id="test-image" 
       src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4" 
       alt="Test Image"
       style="width: 300px; height: 200px;">
  <p>Image should load correctly without intervention</p>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-normal-image.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify image URL has no filter strings
  const imageInfo = await page.evaluate(() => {
    const img = document.querySelector('#test-image');
    return {
      src: img.src,
      hasFilterString: img.src.includes('filters') || img.src.includes('format(')
    };
  });
  
  console.log('Image info:', imageInfo);
  
  if (imageInfo.hasFilterString) {
    throw new Error('Test image should NOT have filter strings');
  }
  
  console.log('✓ Image URL is clean (no filter strings)');
  
  // Execute captureScript
  console.log('\nExecuting captureScript on unfixed code...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save captured HTML
  const capturedFilePath = path.join(__dirname, 'captured-normal-image.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  await page.close();
  
  // Load captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Track image load events
  let imageLoaded = false;
  capturedPage.on('response', response => {
    if (response.url().includes('unsplash.com') && response.status() === 200) {
      imageLoaded = true;
    }
  });
  
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  await capturedPage.waitForTimeout(2000);
  
  // Check image status
  const imageStatus = await capturedPage.evaluate(() => {
    const img = document.querySelector('#test-image');
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      src: img.src
    };
  });
  
  console.log('Image status in captured page:', imageStatus);
  
  // Clean up
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // Verify preservation: normal images should load successfully
  const passed = imageStatus.complete && imageStatus.naturalWidth > 0;
  
  if (passed) {
    console.log('\n✓ PRESERVATION VERIFIED: Normal images load correctly on unfixed code');
    return { passed: true, property: 'Normal Image Loading Preservation' };
  } else {
    console.log('\n❌ PRESERVATION FAILED: Normal image failed to load');
    return { 
      passed: false, 
      property: 'Normal Image Loading Preservation',
      issue: `Image load failed (naturalWidth: ${imageStatus.naturalWidth})`
    };
  }
}

/**
 * Property 4b: Pre-Reveal Phase Preservation
 * **Validates: Requirements 3.2**
 * 
 * Verify pre-reveal phase operations work correctly on unfixed code:
 * - Visibility forcing
 * - Element tagging with cstudio-animate-me
 * - Scroll unlock
 */
async function testPreRevealPhasePreservation(browser) {
  console.log('\n=== Property 4b: Pre-Reveal Phase Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Create test HTML with hidden elements
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pre-Reveal Test</title>
  <style>
    .opacity-0 { opacity: 0; }
  </style>
</head>
<body>
  <h1>Pre-Reveal Phase Test</h1>
  <div class="opacity-0" id="hidden-element-1">
    <p>Hidden Element 1</p>
  </div>
  <div style="opacity: 0;" id="hidden-element-2">
    <p>Hidden Element 2</p>
  </div>
  <div style="visibility: hidden;" id="hidden-element-3">
    <p>Hidden Element 3</p>
  </div>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-pre-reveal.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Execute captureScript
  console.log('\nExecuting captureScript on unfixed code...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save captured HTML
  const capturedFilePath = path.join(__dirname, 'captured-pre-reveal.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  await page.close();
  
  // Load captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify pre-reveal operations
  const preRevealResults = await capturedPage.evaluate(() => {
    const el1 = document.querySelector('#hidden-element-1');
    const el2 = document.querySelector('#hidden-element-2');
    const el3 = document.querySelector('#hidden-element-3');
    
    return {
      element1: {
        hasClass: el1.classList.contains('cstudio-animate-me'),
        opacity: window.getComputedStyle(el1).opacity,
        visibility: window.getComputedStyle(el1).visibility
      },
      element2: {
        hasClass: el2.classList.contains('cstudio-animate-me'),
        opacity: window.getComputedStyle(el2).opacity,
        visibility: window.getComputedStyle(el2).visibility
      },
      element3: {
        hasClass: el3.classList.contains('cstudio-animate-me'),
        opacity: window.getComputedStyle(el3).opacity,
        visibility: window.getComputedStyle(el3).visibility
      },
      bodyOverflow: window.getComputedStyle(document.body).overflow,
      htmlOverflow: window.getComputedStyle(document.documentElement).overflow
    };
  });
  
  console.log('Pre-reveal results:', preRevealResults);
  
  // Clean up
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // Verify preservation: elements should be tagged and made visible
  const allTagged = preRevealResults.element1.hasClass && 
                    preRevealResults.element2.hasClass && 
                    preRevealResults.element3.hasClass;
  
  // Elements may be mid-animation, so check if opacity > 0 (not hidden)
  const allVisible = parseFloat(preRevealResults.element1.opacity) > 0 &&
                     parseFloat(preRevealResults.element2.opacity) > 0 &&
                     parseFloat(preRevealResults.element3.opacity) > 0;
  
  const scrollUnlocked = preRevealResults.bodyOverflow === 'auto' &&
                         preRevealResults.htmlOverflow === 'auto';
  
  const passed = allTagged && allVisible && scrollUnlocked;
  
  if (passed) {
    console.log('\n✓ PRESERVATION VERIFIED: Pre-reveal phase works correctly on unfixed code');
    return { passed: true, property: 'Pre-Reveal Phase Preservation' };
  } else {
    console.log('\n❌ PRESERVATION FAILED: Pre-reveal phase not working as expected');
    return { 
      passed: false, 
      property: 'Pre-Reveal Phase Preservation',
      issue: `Tagged: ${allTagged}, Visible: ${allVisible}, Scroll: ${scrollUnlocked}`
    };
  }
}

/**
 * Property 4c: DOM Capture and Phantom Engine Injection Preservation
 * **Validates: Requirements 3.3, 3.5**
 * 
 * Verify DOM snapshot capture and Phantom Engine injection work correctly:
 * - Script removal (except visbug)
 * - Phantom Engine script injection
 * - GSAP and ScrollTrigger loading from CDN
 */
async function testDOMCapturePreservation(browser) {
  console.log('\n=== Property 4c: DOM Capture and Phantom Engine Injection Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Create test HTML with scripts
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>DOM Capture Test</title>
  <script src="https://example.com/react.js"></script>
  <script src="https://example.com/app.js"></script>
</head>
<body>
  <h1>DOM Capture Test</h1>
  <p>Testing script removal and Phantom Engine injection</p>
  <script>console.log('inline script');</script>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-dom-capture.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Count scripts before capture
  const beforeCapture = await page.evaluate(() => {
    return {
      scriptCount: document.querySelectorAll('script').length
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute captureScript
  console.log('\nExecuting captureScript on unfixed code...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save captured HTML
  const capturedFilePath = path.join(__dirname, 'captured-dom.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  await page.close();
  
  // Load captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  
  // Wait for GSAP to load
  await capturedPage.waitForTimeout(3000);
  
  // Verify DOM capture results
  const captureResults = await capturedPage.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    const phantomScript = scripts.find(s => s.innerHTML.includes('gsap') || s.innerHTML.includes('ScrollTrigger'));
    
    return {
      totalScripts: scripts.length,
      hasPhantomScript: !!phantomScript,
      gsapLoaded: typeof gsap !== 'undefined',
      scrollTriggerLoaded: typeof ScrollTrigger !== 'undefined',
      hasReactScript: scripts.some(s => s.src && s.src.includes('react')),
      hasAppScript: scripts.some(s => s.src && s.src.includes('app.js'))
    };
  });
  
  console.log('Capture results:', captureResults);
  
  // Clean up
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // Verify preservation: scripts removed, Phantom Engine injected, GSAP loaded
  const scriptsRemoved = !captureResults.hasReactScript && !captureResults.hasAppScript;
  const phantomInjected = captureResults.hasPhantomScript;
  const gsapWorking = captureResults.gsapLoaded && captureResults.scrollTriggerLoaded;
  
  const passed = scriptsRemoved && phantomInjected && gsapWorking;
  
  if (passed) {
    console.log('\n✓ PRESERVATION VERIFIED: DOM capture and Phantom Engine work correctly on unfixed code');
    return { passed: true, property: 'DOM Capture and Phantom Engine Preservation' };
  } else {
    console.log('\n❌ PRESERVATION FAILED: DOM capture or Phantom Engine not working as expected');
    return { 
      passed: false, 
      property: 'DOM Capture and Phantom Engine Preservation',
      issue: `Scripts removed: ${scriptsRemoved}, Phantom: ${phantomInjected}, GSAP: ${gsapWorking}`
    };
  }
}

/**
 * Main test runner
 */
async function runPreservationPropertyTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Preservation Property Tests - GSAP & Images           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nIMPORTANT: These tests MUST PASS on unfixed code');
  console.log('They confirm baseline behavior that must be preserved after the fix\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const results = [];
    
    // Run Property 3: Below-Fold Animation Preservation
    const test1Result = await testBelowFoldAnimationPreservation(browser);
    results.push(test1Result);
    
    // Run Property 4a: Normal Image Loading Preservation
    const test2Result = await testNormalImageLoadingPreservation(browser);
    results.push(test2Result);
    
    // Run Property 4b: Pre-Reveal Phase Preservation
    const test3Result = await testPreRevealPhasePreservation(browser);
    results.push(test3Result);
    
    // Run Property 4c: DOM Capture Preservation
    const test4Result = await testDOMCapturePreservation(browser);
    results.push(test4Result);
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    results.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.property}`);
      console.log(`  Status: ${result.passed ? '✓ PASSED' : '❌ FAILED'}`);
      if (result.issue) {
        console.log(`  Issue: ${result.issue}`);
      }
      console.log('');
    });
    
    const allPassed = results.every(r => r.passed);
    
    if (allPassed) {
      console.log('✓ PRESERVATION BASELINE CONFIRMED: All tests passed on unfixed code');
      console.log('  These behaviors must be preserved after implementing the fix');
      process.exit(0);
    } else {
      console.log('❌ PRESERVATION BASELINE FAILED: Some tests did not pass');
      console.log('  Investigate why baseline behavior is not working as expected');
      process.exit(1);
    }
    
  } finally {
    await browser.close();
  }
}

// Run tests
runPreservationPropertyTests().catch(error => {
  console.error('\n❌ TEST EXECUTION ERROR:', error);
  process.exit(1);
});
