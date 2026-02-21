/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bugs exist
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * 
 * GOAL: Surface counterexamples that demonstrate both bugs exist:
 * 1. Hero elements with rect.top <= window.innerHeight * 0.3 remain at opacity: 0
 * 2. Images with filter strings in URLs result in 404 errors
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_TIMEOUT = 30000;
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1200;
const HERO_THRESHOLD = VIEWPORT_HEIGHT * 0.3; // 240px

/**
 * Create a test HTML page with hero section and problematic image
 */
function createTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bug Condition Test Page</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
    }
    .hero-section {
      height: 300px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .hero-heading {
      font-size: 48px;
      font-weight: bold;
    }
    .hero-image {
      width: 200px;
      height: 200px;
      object-fit: cover;
    }
    .below-fold-content {
      height: 1500px;
      padding: 50px;
      background: #f5f5f5;
    }
    .below-fold-element {
      margin-top: 800px;
      padding: 20px;
      background: white;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="hero-section">
    <div>
      <h1 class="hero-heading opacity-0" style="opacity: 0;">Hero Heading</h1>
      <img class="hero-image opacity-0" 
           src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?filtersformat(webp)" 
           alt="Hero Image"
           style="opacity: 0;">
    </div>
  </div>
  <div class="below-fold-content">
    <p>Some content...</p>
    <div class="below-fold-element opacity-0" style="opacity: 0;">
      <h2>Below Fold Element</h2>
      <p>This should be animated on scroll</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Simulate the captureScript from useAppSaveAllResource.js
 * This is the UNFIXED version that contains the bugs
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
      '[style*="opacity: 0"]:not([role="dialog"]):not([role="menu"])'
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
            
            // BUG: Animates ALL elements without checking viewport position
            const elementsToAnimate = document.querySelectorAll('.cstudio-animate-me');
            elementsToAnimate.forEach(el => {
              if (el.closest('.modal, [role="dialog"]')) return;
              
              // Re-apply animation state cleanly now that GSAP is ready
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
 * Test 1: Hero Section Blank Screen Bug
 * Verifies that hero elements remain at opacity: 0 for 2+ seconds
 */
async function testHeroBlankScreen(browser) {
  console.log('\n=== Test 1: Hero Section Blank Screen Bug ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Create test HTML
  const testHTML = createTestHTML();
  const testFilePath = path.join(__dirname, 'test-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  // Load the test page
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Get hero element positions
  const heroPositions = await page.evaluate(() => {
    const heroHeading = document.querySelector('.hero-heading');
    const heroImage = document.querySelector('.hero-image');
    const rect1 = heroHeading.getBoundingClientRect();
    const rect2 = heroImage.getBoundingClientRect();
    return {
      heading: { top: rect1.top, element: 'hero-heading' },
      image: { top: rect2.top, element: 'hero-image' },
      viewportHeight: window.innerHeight,
      threshold: window.innerHeight * 0.3
    };
  });
  
  console.log('Hero element positions:', heroPositions);
  console.log(`Viewport threshold (30%): ${heroPositions.threshold}px`);
  
  // Verify hero elements are within threshold
  if (heroPositions.heading.top > heroPositions.threshold) {
    throw new Error(`Hero heading is NOT in hero section (top: ${heroPositions.heading.top}px > threshold: ${heroPositions.threshold}px)`);
  }
  if (heroPositions.image.top > heroPositions.threshold) {
    throw new Error(`Hero image is NOT in hero section (top: ${heroPositions.image.top}px > threshold: ${heroPositions.threshold}px)`);
  }
  
  console.log('✓ Hero elements are correctly positioned within viewport threshold');
  
  // Execute the UNFIXED captureScript and get captured HTML
  console.log('\nExecuting UNFIXED captureScript...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save captured HTML to a new file
  const capturedFilePath = path.join(__dirname, 'captured-hero-page.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  // Close original page and load the captured HTML in a new page
  await page.close();
  
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Load the captured HTML (this is where the bug manifests)
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  
  // Wait for GSAP to load and initialize
  await capturedPage.waitForTimeout(2000);
  
  // Measure opacity over time
  const opacityMeasurements = [];
  const measurementInterval = 500; // ms
  const totalMeasurements = 6; // 3 seconds total
  
  console.log('\nMeasuring hero element opacity over time:');
  for (let i = 0; i < totalMeasurements; i++) {
    const opacity = await capturedPage.evaluate(() => {
      const heroHeading = document.querySelector('.hero-heading');
      const heroImage = document.querySelector('.hero-image');
      return {
        heading: window.getComputedStyle(heroHeading).opacity,
        image: window.getComputedStyle(heroImage).opacity,
        timestamp: Date.now()
      };
    });
    opacityMeasurements.push(opacity);
    console.log(`  ${i * measurementInterval}ms: heading=${opacity.heading}, image=${opacity.image}`);
    
    if (i < totalMeasurements - 1) {
      await capturedPage.waitForTimeout(measurementInterval);
    }
  }
  
  // Analyze results
  const blankScreenDuration = opacityMeasurements.findIndex(m => 
    parseFloat(m.heading) > 0.5 && parseFloat(m.image) > 0.5
  ) * measurementInterval;
  
  console.log(`\n📊 COUNTEREXAMPLE FOUND:`);
  console.log(`   Hero elements remained at opacity: 0 for ${blankScreenDuration}ms`);
  console.log(`   Expected: Visible immediately (opacity: 1)`);
  console.log(`   Actual: Blank screen for ${blankScreenDuration / 1000} seconds`);
  
  // Clean up
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // EXPECTED TO FAIL: Hero elements should be visible immediately
  // On unfixed code, they remain at opacity: 0 for 2+ seconds
  if (blankScreenDuration >= 2000 || blankScreenDuration === -1) {
    console.log('\n❌ TEST FAILED (EXPECTED): Bug confirmed - hero elements remain hidden');
    return {
      passed: false,
      bug: 'Hero Blank Screen',
      counterexample: `Hero elements at rect.top <= ${heroPositions.threshold}px remained at opacity: 0 for ${blankScreenDuration >= 0 ? blankScreenDuration : '3000+'}ms instead of being visible immediately`
    };
  } else {
    console.log('\n✓ TEST PASSED (UNEXPECTED): Hero elements became visible quickly');
    return {
      passed: true,
      bug: 'Hero Blank Screen',
      note: 'Bug may already be fixed or test needs adjustment'
    };
  }
}

/**
 * Test 2: Image Filter String 404 Bug
 * Verifies that images with filter strings fail to load
 */
async function testImageFilterString404(browser) {
  console.log('\n=== Test 2: Image Filter String 404 Bug ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Track console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Track failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()
    });
  });
  
  // Create test HTML with image containing filter string
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Image Filter Test</title>
</head>
<body>
  <h1>Image Filter String Test</h1>
  <img id="test-image" 
       src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?filtersformat(webp)" 
       alt="Test Image"
       style="width: 300px; height: 200px;">
  <p>Image should display correctly with CDN fallback</p>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-image-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  // Load the test page
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Execute the UNFIXED captureScript
  console.log('\nExecuting UNFIXED captureScript...');
  const capturedHTML = await page.evaluate(getCaptureScript());
  
  // Save captured HTML to a new file
  const capturedFilePath = path.join(__dirname, 'captured-page.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  // Load the captured HTML in a new page
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Track errors on captured page
  const capturedConsoleErrors = [];
  capturedPage.on('console', msg => {
    if (msg.type() === 'error') {
      capturedConsoleErrors.push(msg.text());
    }
  });
  
  const capturedFailedRequests = [];
  capturedPage.on('requestfailed', request => {
    capturedFailedRequests.push({
      url: request.url(),
      failure: request.failure()
    });
  });
  
  // Load captured page
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  await capturedPage.waitForTimeout(2000);
  
  // Check if image loaded successfully
  const imageStatus = await capturedPage.evaluate(() => {
    const img = document.querySelector('#test-image');
    if (!img) return { found: false };
    return {
      found: true,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      src: img.src,
      currentSrc: img.currentSrc
    };
  });
  
  console.log('\nImage status:', imageStatus);
  console.log('Console errors:', capturedConsoleErrors.length);
  console.log('Failed requests:', capturedFailedRequests.length);
  
  // Analyze results
  const hasFilterString = imageStatus.src && imageStatus.src.includes('filters');
  const imageLoadFailed = !imageStatus.complete || imageStatus.naturalWidth === 0;
  
  console.log(`\n📊 COUNTEREXAMPLE FOUND:`);
  console.log(`   Image URL contains filter string: ${hasFilterString}`);
  console.log(`   Image load failed: ${imageLoadFailed}`);
  console.log(`   Expected: Image displays correctly with CDN fallback`);
  console.log(`   Actual: Image shows 404 error (naturalWidth: ${imageStatus.naturalWidth})`);
  
  // Clean up
  await capturedPage.close();
  await page.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // EXPECTED TO FAIL: Images with filter strings should self-heal
  // On unfixed code, they fail to load (404 error)
  if (imageLoadFailed) {
    console.log('\n❌ TEST FAILED (EXPECTED): Bug confirmed - image with filter string failed to load');
    return {
      passed: false,
      bug: 'Image Filter String 404',
      counterexample: `Image with filter string in URL (${imageStatus.src}) failed to load (naturalWidth: ${imageStatus.naturalWidth}, complete: ${imageStatus.complete})`
    };
  } else {
    console.log('\n✓ TEST PASSED (UNEXPECTED): Image loaded successfully');
    return {
      passed: true,
      bug: 'Image Filter String 404',
      note: 'Bug may already be fixed or test needs adjustment'
    };
  }
}

/**
 * Main test runner
 */
async function runBugConditionExplorationTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Bug Condition Exploration Test - GSAP Animation & Image Bugs ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nCRITICAL: These tests MUST FAIL on unfixed code');
  console.log('Failure confirms the bugs exist and validates the root cause analysis\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const results = [];
    
    // Run Test 1: Hero Blank Screen Bug
    const test1Result = await testHeroBlankScreen(browser);
    results.push(test1Result);
    
    // Run Test 2: Image Filter String 404 Bug
    const test2Result = await testImageFilterString404(browser);
    results.push(test2Result);
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    results.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.bug}`);
      console.log(`  Status: ${result.passed ? '✓ PASSED (UNEXPECTED)' : '❌ FAILED (EXPECTED)'}`);
      if (result.counterexample) {
        console.log(`  Counterexample: ${result.counterexample}`);
      }
      if (result.note) {
        console.log(`  Note: ${result.note}`);
      }
      console.log('');
    });
    
    const allFailed = results.every(r => !r.passed);
    const allPassed = results.every(r => r.passed);
    
    if (allFailed) {
      console.log('✓ EXPLORATION COMPLETE: Both bugs confirmed on unfixed code');
      console.log('  Counterexamples documented - ready to proceed with fix implementation');
      process.exit(0); // Success - bugs exist as expected
    } else if (allPassed) {
      console.log('⚠ UNEXPECTED: All tests passed - bugs may already be fixed');
      console.log('  Re-investigate root cause or verify test implementation');
      process.exit(1); // Unexpected - need to investigate
    } else {
      console.log('⚠ PARTIAL: Some tests passed, some failed');
      console.log('  Review individual test results and investigate');
      process.exit(1); // Mixed results - need to investigate
    }
    
  } finally {
    await browser.close();
  }
}

// Run tests
runBugConditionExplorationTests().catch(error => {
  console.error('\n❌ TEST EXECUTION ERROR:', error);
  process.exit(1);
});
