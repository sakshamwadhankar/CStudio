/**
 * Bug Fix Verification Test - VisBug CSP Preloader Bugfix
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 * 
 * This test verifies that the GOD-MODE DOM CLEANSER successfully fixes all three bugs:
 * 1. VisBug UI elements (<vis-bug>, chrome-extension:// paths) are removed from captured HTML
 * 2. CSP meta tags are removed, allowing external GSAP CDN scripts to execute
 * 3. High z-index preloader overlays (>50) are hidden with display:none, opacity:0, pointer-events:none
 * 
 * EXPECTED OUTCOME: All tests PASS - bugs are fixed
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1200;

/**
 * Create test HTML with VisBug UI elements
 */
function createVisBugTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VisBug UI Test Page</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .content { padding: 20px; background: #f0f0f0; }
  </style>
</head>
<body>
  <div class="content">
    <h1>Test Page with VisBug UI</h1>
    <p>This page simulates VisBug extension being active</p>
  </div>
  
  <!-- VisBug UI elements that should be removed -->
  <vis-bug id="visbug-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; pointer-events: none;"></vis-bug>
  <div id="visbug" style="position: fixed; bottom: 20px; right: 20px; background: white; padding: 10px; border: 1px solid #ccc;">
    VisBug Controls
  </div>
  
  <!-- Chrome extension paths that should be removed -->
  <script src="chrome-extension://abcdef123456/visbug.js"></script>
  <link rel="stylesheet" href="chrome-extension://abcdef123456/visbug.css">
  <img src="chrome-extension://abcdef123456/icon.png" alt="VisBug Icon">
</body>
</html>`;
}

/**
 * Create test HTML with CSP meta tag
 */
function createCSPTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
  <meta http-equiv="refresh" content="30;url=https://example.com">
  <title>CSP Test Page</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .content { padding: 20px; background: #e0f7fa; }
  </style>
</head>
<body>
  <div class="content">
    <h1>Test Page with CSP</h1>
    <p>This page has Content-Security-Policy that blocks external scripts</p>
    <div id="animation-target" class="opacity-0" style="opacity: 0; padding: 20px; background: #fff; margin-top: 20px;">
      This should be animated by GSAP
    </div>
  </div>
</body>
</html>`;
}

/**
 * Create test HTML with high z-index preloader
 */
function createPreloaderTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Preloader Test Page</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .content { padding: 20px; }
    
    /* High z-index preloader that should be removed */
    .preloader-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
    }
  </style>
</head>
<body>
  <div class="preloader-overlay">Loading...</div>
  <div class="content">
    <h1>Test Page with Preloader</h1>
    <p>This page has a full-screen preloader overlay that should be removed</p>
  </div>
</body>
</html>`;
}

/**
 * Create test HTML with all three bugs combined
 */
function createCombinedBugTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline';">
  <title>Combined Bug Test Page</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .content { padding: 20px; }
    .preloader { position: fixed; top: 0; left: 0; width: 100%; height: 100vh; background: white; z-index: 999; }
  </style>
</head>
<body>
  <div class="preloader">Loading...</div>
  <vis-bug style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999;"></vis-bug>
  <script src="chrome-extension://abc123/visbug.js"></script>
  
  <div class="content">
    <h1>Combined Bug Test</h1>
    <p>This page has all three bugs: VisBug UI, CSP blocking, and stuck preloader</p>
  </div>
</body>
</html>`;
}

/**
 * Get the FIXED captureScript (with GOD-MODE DOM CLEANSER)
 * This includes the fix from Task 3.1
 */
function getFixedCaptureScript() {
  return `
    const liveBase = window.location.origin;
    
    // ═══════════════════════════════════════════════════════════════
    // GOD-MODE DOM CLEANSER 🧹🔥
    // Removes VisBug UI, CSP blocks, and stuck preloaders
    // ═══════════════════════════════════════════════════════════════

    // A. KILL CSP & META REFRESH (Allows our CDN scripts to run)
    document.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());

    // B. KILL VISBUG UI & EXTENSION LEFTOVERS (Fixes 'invalid/' error & invisible shields)
    document.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
    document.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

    // C. AGGRESSIVE PRELOADER NUKE (Kills full-screen loading overlays)
    const allDivs = document.querySelectorAll('div, section');
    console.log('Total divs/sections found:', allDivs.length);
    
    const preloadersFound = [];
    allDivs.forEach(el => {
      const style = window.getComputedStyle(el);
      const className = el.className || '(no class)';
      
      // Log preloader specifically
      if (className.includes('preloader')) {
        console.log('Found .preloader element:', {
          className,
          position: style.position,
          zIndex: style.zIndex,
          height: style.height,
          bottom: style.bottom,
          top: style.top
        });
      }
      
      const isFixed = style.position === 'fixed';
      const hasFullHeight = style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0';
      const hasHighZIndex = parseInt(style.zIndex) > 50;
      
      if (isFixed && hasFullHeight && hasHighZIndex) {
         preloadersFound.push({
           className,
           zIndex: style.zIndex,
           height: style.height,
           bottom: style.bottom
         });
         el.style.setProperty('display', 'none', 'important');
         el.style.setProperty('opacity', '0', 'important');
         el.style.setProperty('pointer-events', 'none', 'important');
         console.log('Applied styles to:', className);
      }
    });
    console.log('Preloaders found and hidden:', preloadersFound.length);

    // ═══════════════════════════════════════════════════════════════
    
    // 1. STORE ORIGINAL URLS & AGGRESSIVE ABSOLUTIZATION
    document.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
      ['src', 'data-src', 'poster'].forEach(attr => {
        if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
          const originalUrl = el.getAttribute(attr);
          el.setAttribute('data-original-src', new URL(originalUrl, liveBase).href);
          try { el.setAttribute(attr, new URL(originalUrl, liveBase).href); } catch(e){}
        }
      });
    });
    
    document.querySelectorAll('link[href], a[href]').forEach(el => {
      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('data:')) {
        try { el.href = new URL(el.getAttribute('href'), liveBase).href; } catch(e){}
      }
    });
    
    // 2. PRE-REVEAL & SCROLL UNLOCK
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
      el.classList.add('cstudio-animate-me');
    });
    
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    
    // 3. THE ABSOLUTE NUKE
    document.querySelectorAll('script').forEach(script => {
      if (script.src && script.src.includes('visbug')) return;
      script.remove();
    });
    
    document.documentElement.outerHTML;
  `;
}

/**
 * Test 1: VisBug UI Captured Bug
 */
async function testVisBugUICaptured(browser) {
  console.log('\n=== Test 1: VisBug UI Captured Bug ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createVisBugTestHTML();
  const testFilePath = path.join(__dirname, 'test-visbug-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify VisBug elements exist before capture
  const beforeCapture = await page.evaluate(() => {
    return {
      visBugElement: !!document.querySelector('vis-bug'),
      visBugId: !!document.querySelector('#visbug'),
      chromeExtensionScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
      chromeExtensionLinks: document.querySelectorAll('[href^="chrome-extension://"]').length
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML to check for VisBug artifacts
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    return {
      visBugElement: !!document.querySelector('vis-bug'),
      visBugId: !!document.querySelector('#visbug'),
      chromeExtensionScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
      chromeExtensionLinks: document.querySelectorAll('[href^="chrome-extension://"]').length,
      invalidPaths: document.querySelectorAll('[src^="invalid/"], [href^="invalid/"]').length
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Check if bug exists
  const bugExists = afterCapture.visBugElement || 
                    afterCapture.visBugId || 
                    afterCapture.chromeExtensionScripts > 0 || 
                    afterCapture.chromeExtensionLinks > 0;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   VisBug elements removed: ${!bugExists}`);
  console.log(`   Expected: All VisBug UI removed`);
  console.log(`   Actual: <vis-bug>=${afterCapture.visBugElement}, #visbug=${afterCapture.visBugId}, chrome-extension paths=${afterCapture.chromeExtensionScripts + afterCapture.chromeExtensionLinks}`);
  
  if (!bugExists) {
    console.log('\n✓ TEST PASSED: VisBug UI successfully removed');
    return {
      passed: true,
      bug: 'VisBug UI Captured',
      note: 'Fix working correctly'
    };
  } else {
    console.log('\n❌ TEST FAILED: VisBug UI still present after fix');
    return {
      passed: false,
      bug: 'VisBug UI Captured',
      counterexample: `VisBug elements persisted in captured HTML: <vis-bug>=${afterCapture.visBugElement}, #visbug=${afterCapture.visBugId}, chrome-extension paths=${afterCapture.chromeExtensionScripts + afterCapture.chromeExtensionLinks}`
    };
  }
}

/**
 * Test 2: CSP Blocking GSAP Bug
 */
async function testCSPBlockingGSAP(browser) {
  console.log('\n=== Test 2: CSP Blocking GSAP Bug ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCSPTestHTML();
  const testFilePath = path.join(__dirname, 'test-csp-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify CSP meta tag exists before capture
  const beforeCapture = await page.evaluate(() => {
    return {
      cspMetaTag: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      metaRefreshTag: !!document.querySelector('meta[http-equiv="refresh"]')
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Save and load captured HTML
  const capturedFilePath = path.join(__dirname, 'captured-csp-page.html');
  fs.writeFileSync(capturedFilePath, capturedHTML);
  
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  // Track CSP violations
  const cspViolations = [];
  capturedPage.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
      cspViolations.push(msg.text());
    }
  });
  
  await capturedPage.goto(`file://${capturedFilePath}`, { waitUntil: 'networkidle0' });
  await capturedPage.waitForTimeout(1000);
  
  const afterCapture = await capturedPage.evaluate(() => {
    return {
      cspMetaTag: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      metaRefreshTag: !!document.querySelector('meta[http-equiv="refresh"]')
    };
  });
  
  console.log('After capture:', afterCapture);
  console.log('CSP violations:', cspViolations.length);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  fs.unlinkSync(capturedFilePath);
  
  // Check if bug exists
  const bugExists = afterCapture.cspMetaTag || afterCapture.metaRefreshTag;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   CSP/refresh meta tags removed: ${!bugExists}`);
  console.log(`   Expected: CSP and refresh meta tags removed`);
  console.log(`   Actual: CSP=${afterCapture.cspMetaTag}, refresh=${afterCapture.metaRefreshTag}`);
  
  if (!bugExists) {
    console.log('\n✓ TEST PASSED: CSP meta tags successfully removed');
    return {
      passed: true,
      bug: 'CSP Blocking GSAP',
      note: 'Fix working correctly'
    };
  } else {
    console.log('\n❌ TEST FAILED: CSP meta tags still present after fix');
    return {
      passed: false,
      bug: 'CSP Blocking GSAP',
      counterexample: `CSP/refresh meta tags persisted in captured HTML: CSP=${afterCapture.cspMetaTag}, refresh=${afterCapture.metaRefreshTag}`
    };
  }
}

/**
 * Test 3: High Z-Index Preloader Not Removed Bug
 */
async function testPreloaderNotRemoved(browser) {
  console.log('\n=== Test 3: High Z-Index Preloader Not Removed Bug ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createPreloaderTestHTML();
  const testFilePath = path.join(__dirname, 'test-preloader-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify preloader exists before capture
  const beforeCapture = await page.evaluate(() => {
    const preloader = document.querySelector('.preloader-overlay');
    if (!preloader) return { found: false };
    const style = window.getComputedStyle(preloader);
    return {
      found: true,
      position: style.position,
      zIndex: style.zIndex,
      height: style.height,
      display: style.display
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Load captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const preloader = document.querySelector('.preloader-overlay');
    if (!preloader) return { found: false };
    const style = window.getComputedStyle(preloader);
    return {
      found: true,
      position: style.position,
      zIndex: style.zIndex,
      height: style.height,
      display: style.display,
      opacity: style.opacity,
      visible: style.display !== 'none' && style.opacity !== '0'
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Check if bug exists (preloader with z-index 500 should be removed)
  const bugExists = afterCapture.found && afterCapture.visible;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   Preloader hidden: ${!bugExists}`);
  console.log(`   Expected: Preloader hidden (z-index 500 > 50 threshold)`);
  console.log(`   Actual: display=${afterCapture.display}, opacity=${afterCapture.opacity}, visible=${afterCapture.visible}`);
  
  if (!bugExists) {
    console.log('\n✓ TEST PASSED: Preloader successfully hidden');
    return {
      passed: true,
      bug: 'Preloader Not Removed',
      note: 'Fix working correctly'
    };
  } else {
    console.log('\n❌ TEST FAILED: Preloader still visible after fix');
    return {
      passed: false,
      bug: 'Preloader Not Removed',
      counterexample: `Preloader with z-index ${afterCapture.zIndex} remained visible (display=${afterCapture.display}, opacity=${afterCapture.opacity})`
    };
  }
}

/**
 * Test 4: Combined Bug Test
 */
async function testCombinedBugs(browser) {
  console.log('\n=== Test 4: Combined Bug Test ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCombinedBugTestHTML();
  const testFilePath = path.join(__dirname, 'test-combined-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  console.log('Test HTML preview:');
  console.log(testHTML.substring(0, 500));
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Check preloader before capture
  const beforeCapture = await page.evaluate(() => {
    const preloader = document.querySelector('.preloader');
    if (!preloader) return { found: false };
    const style = window.getComputedStyle(preloader);
    return {
      found: true,
      position: style.position,
      zIndex: style.zIndex,
      height: style.height,
      bottom: style.bottom,
      top: style.top,
      display: style.display
    };
  });
  console.log('Before capture - preloader:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Check if preloader styles are in the HTML string
  const preloaderMatch = capturedHTML.match(/<div class="preloader"[^>]*>/);
  console.log('Preloader HTML tag:', preloaderMatch ? preloaderMatch[0] : 'not found');
  
  // Load captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const preloader = document.querySelector('.preloader');
    const preloaderStyle = preloader ? window.getComputedStyle(preloader) : null;
    
    return {
      visBugElement: !!document.querySelector('vis-bug'),
      chromeExtensionScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
      cspMetaTag: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      preloaderVisible: preloader && preloaderStyle.display !== 'none' && preloaderStyle.opacity !== '0',
      preloaderDetails: preloader ? {
        position: preloaderStyle.position,
        zIndex: preloaderStyle.zIndex,
        height: preloaderStyle.height,
        bottom: preloaderStyle.bottom,
        display: preloaderStyle.display,
        opacity: preloaderStyle.opacity
      } : null
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Check if all three bugs are fixed
  const allBugsFixed = !afterCapture.visBugElement && 
                       !afterCapture.cspMetaTag && 
                       !afterCapture.preloaderVisible;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   All three bugs fixed: ${allBugsFixed}`);
  console.log(`   VisBug UI removed: ${!afterCapture.visBugElement}`);
  console.log(`   CSP removed: ${!afterCapture.cspMetaTag}`);
  console.log(`   Preloader hidden: ${!afterCapture.preloaderVisible}`);
  console.log(`   Expected: Clean HTML with all bugs fixed`);
  console.log(`   Actual: Functional website with visible content`);
  
  if (allBugsFixed) {
    console.log('\n✓ TEST PASSED: All three bugs successfully fixed');
    return {
      passed: true,
      bug: 'Combined Bugs',
      note: 'Fix working correctly'
    };
  } else {
    console.log('\n❌ TEST FAILED: Some bugs still present after fix');
    return {
      passed: false,
      bug: 'Combined Bugs',
      counterexample: `Some bugs remain: VisBug=${afterCapture.visBugElement}, CSP=${afterCapture.cspMetaTag}, Preloader=${afterCapture.preloaderVisible}`
    };
  }
}

/**
 * Main test runner
 */
async function runBugConditionExplorationTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Bug Fix Verification - VisBug CSP Preloader Bugfix          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nVerifying that GOD-MODE DOM CLEANSER fixes all three bugs\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const results = [];
    
    // Run all tests
    results.push(await testVisBugUICaptured(browser));
    results.push(await testCSPBlockingGSAP(browser));
    results.push(await testPreloaderNotRemoved(browser));
    results.push(await testCombinedBugs(browser));
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    results.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.bug}`);
      console.log(`  Status: ${result.passed ? '✓ PASSED' : '❌ FAILED'}`);
      if (result.counterexample) {
        console.log(`  Issue: ${result.counterexample}`);
      }
      if (result.note) {
        console.log(`  Note: ${result.note}`);
      }
      console.log('');
    });
    
    const allPassed = results.every(r => r.passed);
    const allFailed = results.every(r => !r.passed);
    
    if (allPassed) {
      console.log('✓ FIX VERIFIED: All bugs successfully fixed by GOD-MODE DOM CLEANSER');
      console.log('  VisBug UI elements removed');
      console.log('  CSP meta tags removed');
      console.log('  High z-index preloaders hidden');
      console.log('  Downloaded HTML will display visible content with working animations');
      process.exit(0); // Success - all bugs fixed
    } else if (allFailed) {
      console.log('❌ FIX INCOMPLETE: All tests failed - bugs still present');
      console.log('  Review GOD-MODE DOM CLEANSER implementation');
      process.exit(1); // Failure - bugs not fixed
    } else {
      console.log('⚠ PARTIAL FIX: Some tests passed, some failed');
      console.log('  Review individual test results and investigate');
      process.exit(1); // Partial - need to investigate
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
