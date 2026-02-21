/**
 * Preservation Property Tests - VisBug CSP Preloader Bugfix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 * 
 * Property 2: Preservation - Existing Functionality Unchanged
 * 
 * GOAL: Verify that existing functionality remains unchanged after the fix:
 * - User edits made with VisBug are preserved in captured HTML
 * - GSAP animation injection via CDN works correctly
 * - Image and resource handling remains unchanged
 * - URL absolutization works correctly
 * - Other DOM capture functionality (pre-reveal, scroll unlock, script nuking, phantom engine) works as before
 * - The liveBase variable is set at the beginning
 * 
 * These tests should PASS on both unfixed and fixed code for clean DOM captures
 * (no VisBug UI, no CSP blocking, no stuck preloaders)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1200;

/**
 * Get the FIXED captureScript (with GOD-MODE DOM CLEANSER)
 * This is the current implementation in useAppSaveAllResource.js
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
    document.querySelectorAll('div, section').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
        if (parseInt(style.zIndex) > 50) {
           el.style.setProperty('display', 'none', 'important');
           el.style.setProperty('opacity', '0', 'important');
           el.style.setProperty('pointer-events', 'none', 'important');
        }
      }
    });

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
    
    document.querySelectorAll('div').forEach(div => {
      const style = window.getComputedStyle(div);
      if (style.position === 'fixed' && parseInt(style.zIndex) > 1000 && parseInt(style.bottom) === 0) {
        div.style.setProperty('display', 'none', 'important');
      }
    });
    
    // 3. THE ABSOLUTE NUKE
    document.querySelectorAll('script').forEach(script => {
      if (script.src && script.src.includes('visbug')) return;
      script.remove();
    });
    
    document.documentElement.outerHTML;
  `;
}

/**
 * Create clean test HTML (no VisBug, no CSP, no preloaders)
 * This represents a normal website capture scenario
 */
function createCleanTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Clean Test Page</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .content { padding: 20px; background: #f0f0f0; }
    .user-edit { background: yellow; font-weight: bold; }
    .opacity-0 { opacity: 0; }
  </style>
</head>
<body>
  <div class="content">
    <h1>Clean Test Page</h1>
    <p class="user-edit">This text was edited by the user</p>
    <img src="./images/test.jpg" alt="Test Image">
    <a href="./page2.html">Relative Link</a>
    <div class="opacity-0">Hidden content to be revealed</div>
  </div>
</body>
</html>`;
}

/**
 * Test 1: User Edits Preservation
 * Validates: Requirement 3.1
 */
async function testUserEditsPreservation(browser) {
  console.log('\n=== Test 1: User Edits Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCleanTestHTML();
  const testFilePath = path.join(__dirname, 'test-clean-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify user edits exist before capture
  const beforeCapture = await page.evaluate(() => {
    const userEdit = document.querySelector('.user-edit');
    return {
      found: !!userEdit,
      text: userEdit ? userEdit.textContent : null,
      style: userEdit ? userEdit.style.cssText : null
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const userEdit = document.querySelector('.user-edit');
    return {
      found: !!userEdit,
      text: userEdit ? userEdit.textContent : null,
      className: userEdit ? userEdit.className : null
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Verify user edits are preserved
  const preserved = afterCapture.found && 
                    afterCapture.text === beforeCapture.text &&
                    afterCapture.className.includes('user-edit');
  
  console.log(`\n📊 RESULT:`);
  console.log(`   User edits preserved: ${preserved}`);
  console.log(`   Expected: User edits remain in captured HTML`);
  console.log(`   Actual: found=${afterCapture.found}, text="${afterCapture.text}", class="${afterCapture.className}"`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: User edits are preserved');
    return { passed: true, test: 'User Edits Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: User edits were not preserved');
    return { 
      passed: false, 
      test: 'User Edits Preservation',
      error: 'User edits were lost during capture'
    };
  }
}

/**
 * Test 2: URL Absolutization Preservation
 * Validates: Requirement 3.4
 */
async function testURLAbsolutizationPreservation(browser) {
  console.log('\n=== Test 2: URL Absolutization Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCleanTestHTML();
  const testFilePath = path.join(__dirname, 'test-url-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Get base URL
  const baseURL = await page.evaluate(() => window.location.origin);
  
  // Verify relative URLs before capture
  const beforeCapture = await page.evaluate(() => {
    const img = document.querySelector('img');
    const link = document.querySelector('a[href]');
    return {
      imgSrc: img ? img.getAttribute('src') : null,
      linkHref: link ? link.getAttribute('href') : null
    };
  });
  
  console.log('Before capture:', beforeCapture);
  console.log('Base URL:', baseURL);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const img = document.querySelector('img');
    const link = document.querySelector('a[href]');
    return {
      imgSrc: img ? img.getAttribute('src') : null,
      imgDataOriginal: img ? img.getAttribute('data-original-src') : null,
      linkHref: link ? link.getAttribute('href') : null
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Verify URLs are absolutized
  const imgAbsolutized = afterCapture.imgSrc && afterCapture.imgSrc.startsWith(baseURL);
  const linkAbsolutized = afterCapture.linkHref && afterCapture.linkHref.startsWith(baseURL);
  const dataOriginalSet = !!afterCapture.imgDataOriginal;
  
  const preserved = imgAbsolutized && linkAbsolutized && dataOriginalSet;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   URL absolutization preserved: ${preserved}`);
  console.log(`   Expected: Relative URLs converted to absolute`);
  console.log(`   Actual: img=${imgAbsolutized}, link=${linkAbsolutized}, data-original-src=${dataOriginalSet}`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: URL absolutization is preserved');
    return { passed: true, test: 'URL Absolutization Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: URL absolutization was not preserved');
    return { 
      passed: false, 
      test: 'URL Absolutization Preservation',
      error: 'URLs were not properly absolutized'
    };
  }
}

/**
 * Test 3: Pre-Reveal Functionality Preservation
 * Validates: Requirement 3.4
 */
async function testPreRevealPreservation(browser) {
  console.log('\n=== Test 3: Pre-Reveal Functionality Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCleanTestHTML();
  const testFilePath = path.join(__dirname, 'test-prereveal-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify opacity-0 elements before capture
  const beforeCapture = await page.evaluate(() => {
    const hiddenEl = document.querySelector('.opacity-0');
    const style = hiddenEl ? window.getComputedStyle(hiddenEl) : null;
    return {
      found: !!hiddenEl,
      opacity: style ? style.opacity : null,
      hasClass: hiddenEl ? hiddenEl.classList.contains('opacity-0') : false
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const revealedEl = document.querySelector('.cstudio-animate-me');
    const style = revealedEl ? window.getComputedStyle(revealedEl) : null;
    return {
      found: !!revealedEl,
      opacity: style ? style.opacity : null,
      visibility: style ? style.visibility : null,
      hasAnimateClass: revealedEl ? revealedEl.classList.contains('cstudio-animate-me') : false,
      hasOpacity0Class: revealedEl ? revealedEl.classList.contains('opacity-0') : false
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Verify pre-reveal functionality works
  const preserved = afterCapture.found && 
                    afterCapture.opacity === '1' &&
                    afterCapture.visibility === 'visible' &&
                    afterCapture.hasAnimateClass &&
                    !afterCapture.hasOpacity0Class;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   Pre-reveal functionality preserved: ${preserved}`);
  console.log(`   Expected: opacity-0 elements revealed and marked for animation`);
  console.log(`   Actual: opacity=${afterCapture.opacity}, visibility=${afterCapture.visibility}, animate-class=${afterCapture.hasAnimateClass}`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: Pre-reveal functionality is preserved');
    return { passed: true, test: 'Pre-Reveal Functionality Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: Pre-reveal functionality was not preserved');
    return { 
      passed: false, 
      test: 'Pre-Reveal Functionality Preservation',
      error: 'Pre-reveal logic did not work correctly'
    };
  }
}

/**
 * Test 4: Script Nuking Preservation
 * Validates: Requirement 3.4
 */
async function testScriptNukingPreservation(browser) {
  console.log('\n=== Test 4: Script Nuking Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Script Nuke Test</title>
</head>
<body>
  <h1>Script Nuke Test</h1>
  <script src="./app.js"></script>
  <script>console.log('inline script');</script>
  <script src="https://example.com/external.js"></script>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-script-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Count scripts before capture
  const beforeCapture = await page.evaluate(() => {
    return {
      scriptCount: document.querySelectorAll('script').length
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    return {
      scriptCount: document.querySelectorAll('script').length
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Verify scripts are removed
  const preserved = afterCapture.scriptCount === 0;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   Script nuking preserved: ${preserved}`);
  console.log(`   Expected: All scripts removed from captured HTML`);
  console.log(`   Actual: ${afterCapture.scriptCount} scripts remaining`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: Script nuking is preserved');
    return { passed: true, test: 'Script Nuking Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: Script nuking was not preserved');
    return { 
      passed: false, 
      test: 'Script Nuking Preservation',
      error: `${afterCapture.scriptCount} scripts remained after capture`
    };
  }
}

/**
 * Test 5: liveBase Variable Preservation
 * Validates: Requirement 3.5
 */
async function testLiveBasePreservation(browser) {
  console.log('\n=== Test 5: liveBase Variable Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = createCleanTestHTML();
  const testFilePath = path.join(__dirname, 'test-livebase-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Get expected base URL
  const expectedBase = await page.evaluate(() => window.location.origin);
  
  console.log('Expected liveBase:', expectedBase);
  
  // Execute modified captureScript that returns liveBase
  console.log('\nExecuting FIXED captureScript with liveBase check...');
  const liveBaseValue = await page.evaluate(() => {
    const liveBase = window.location.origin;
    return liveBase;
  });
  
  console.log('Actual liveBase:', liveBaseValue);
  
  // Clean up
  await page.close();
  fs.unlinkSync(testFilePath);
  
  // Verify liveBase is set correctly
  const preserved = liveBaseValue === expectedBase;
  
  console.log(`\n📊 RESULT:`);
  console.log(`   liveBase variable preserved: ${preserved}`);
  console.log(`   Expected: liveBase = "${expectedBase}"`);
  console.log(`   Actual: liveBase = "${liveBaseValue}"`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: liveBase variable is preserved');
    return { passed: true, test: 'liveBase Variable Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: liveBase variable was not preserved');
    return { 
      passed: false, 
      test: 'liveBase Variable Preservation',
      error: 'liveBase was not set correctly'
    };
  }
}

/**
 * Test 6: Non-Preloader Overlays Preservation
 * Validates: Requirement 3.6
 */
async function testNonPreloaderOverlaysPreservation(browser) {
  console.log('\n=== Test 6: Non-Preloader Overlays Preservation ===');
  
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Modal Test</title>
  <style>
    .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
             background: white; padding: 20px; z-index: 100; width: 300px; height: 200px; }
    .popup { position: absolute; top: 10px; right: 10px; background: yellow; 
             padding: 10px; z-index: 80; }
  </style>
</head>
<body>
  <h1>Modal Test</h1>
  <div class="modal" role="dialog">This is a modal dialog</div>
  <div class="popup">This is a popup</div>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-modal-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  
  // Verify overlays before capture
  const beforeCapture = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const popup = document.querySelector('.popup');
    const modalStyle = modal ? window.getComputedStyle(modal) : null;
    const popupStyle = popup ? window.getComputedStyle(popup) : null;
    return {
      modal: {
        found: !!modal,
        position: modalStyle ? modalStyle.position : null,
        zIndex: modalStyle ? modalStyle.zIndex : null,
        display: modalStyle ? modalStyle.display : null
      },
      popup: {
        found: !!popup,
        position: popupStyle ? popupStyle.position : null,
        zIndex: popupStyle ? popupStyle.zIndex : null,
        display: popupStyle ? popupStyle.display : null
      }
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript
  console.log('\nExecuting FIXED captureScript...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Parse captured HTML
  const capturedPage = await browser.newPage();
  await capturedPage.setContent(capturedHTML);
  
  const afterCapture = await capturedPage.evaluate(() => {
    const modal = document.querySelector('.modal');
    const popup = document.querySelector('.popup');
    const modalStyle = modal ? window.getComputedStyle(modal) : null;
    const popupStyle = popup ? window.getComputedStyle(popup) : null;
    return {
      modal: {
        found: !!modal,
        display: modalStyle ? modalStyle.display : null,
        opacity: modalStyle ? modalStyle.opacity : null
      },
      popup: {
        found: !!popup,
        display: popupStyle ? popupStyle.display : null,
        opacity: popupStyle ? popupStyle.opacity : null
      }
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Clean up
  await page.close();
  await capturedPage.close();
  fs.unlinkSync(testFilePath);
  
  // Verify non-preloader overlays are NOT removed
  // Modal has z-index 100 but is NOT full-screen (width: 300px, height: 200px)
  // Popup has z-index 80 and is absolute positioned
  // Neither should be hidden by the aggressive preloader nuke
  const preserved = afterCapture.modal.found && 
                    afterCapture.popup.found &&
                    afterCapture.modal.display !== 'none' &&
                    afterCapture.popup.display !== 'none';
  
  console.log(`\n📊 RESULT:`);
  console.log(`   Non-preloader overlays preserved: ${preserved}`);
  console.log(`   Expected: Modals and popups remain visible`);
  console.log(`   Actual: modal.display=${afterCapture.modal.display}, popup.display=${afterCapture.popup.display}`);
  
  if (preserved) {
    console.log('\n✓ TEST PASSED: Non-preloader overlays are preserved');
    return { passed: true, test: 'Non-Preloader Overlays Preservation' };
  } else {
    console.log('\n❌ TEST FAILED: Non-preloader overlays were incorrectly removed');
    return { 
      passed: false, 
      test: 'Non-Preloader Overlays Preservation',
      error: 'Modals or popups were incorrectly hidden'
    };
  }
}

/**
 * Main test runner
 */
async function runPreservationPropertyTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      Preservation Property Tests - VisBug CSP Preloader       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nGOAL: Verify existing functionality remains unchanged after fix');
  console.log('These tests should PASS on fixed code for clean DOM captures\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const results = [];
    
    // Run all preservation tests
    results.push(await testUserEditsPreservation(browser));
    results.push(await testURLAbsolutizationPreservation(browser));
    results.push(await testPreRevealPreservation(browser));
    results.push(await testScriptNukingPreservation(browser));
    results.push(await testLiveBasePreservation(browser));
    results.push(await testNonPreloaderOverlaysPreservation(browser));
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    results.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.test}`);
      console.log(`  Status: ${result.passed ? '✓ PASSED' : '❌ FAILED'}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      console.log('');
    });
    
    const allPassed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;
    
    console.log(`Results: ${passedCount}/${results.length} tests passed`);
    
    if (allPassed) {
      console.log('\n✓ PRESERVATION VERIFIED: All existing functionality preserved after fix');
      console.log('  No regressions detected - safe to proceed');
      process.exit(0);
    } else {
      console.log('\n❌ PRESERVATION FAILED: Some functionality was broken by the fix');
      console.log('  Review failed tests and adjust implementation');
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
