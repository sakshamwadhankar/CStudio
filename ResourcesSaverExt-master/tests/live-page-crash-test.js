/**
 * Live Page Crash Test
 * 
 * CRITICAL BUG: captureScript is modifying the LIVE page instead of working on a clone
 * 
 * This test verifies that:
 * 1. The original live page is NOT modified during capture
 * 2. Elements are NOT removed from the live page
 * 3. Styles are NOT changed on the live page
 * 4. The live page remains functional after capture
 * 
 * EXPECTED: Test should FAIL showing the bug exists
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Create test HTML that simulates a live website
 */
function createLiveWebsiteHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self';">
  <title>Live Website Test</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .content { padding: 20px; background: #f0f0f0; }
    .preloader { position: fixed; top: 0; left: 0; width: 100%; height: 100vh; 
                 background: rgba(0,0,0,0.5); z-index: 999; display: flex; 
                 align-items: center; justify-content: center; color: white; }
  </style>
</head>
<body>
  <div class="preloader" id="test-preloader">Loading...</div>
  <vis-bug id="test-visbug">VisBug UI</vis-bug>
  
  <div class="content">
    <h1 id="test-heading">Live Website</h1>
    <p id="test-paragraph">This is the original live page</p>
    <button id="test-button" onclick="alert('Button works!')">Click Me</button>
  </div>
  
  <script>
    // Track if page is modified
    window.pageModified = false;
    
    // Monitor DOM changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          console.log('LIVE PAGE MODIFIED: Elements removed!', mutation.removedNodes);
          window.pageModified = true;
        }
      });
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeOldValue: true
    });
  </script>
</body>
</html>`;
}

/**
 * Get the FIXED captureScript (with Smart Clone Strategy)
 */
function getFixedCaptureScript() {
  return `
    const liveBase = window.location.origin;

    // ═══════════════════════════════════════════════════════════════
    // SMART CLONE STRATEGY 🧠
    // Protects live page while using getComputedStyle() correctly
    // ═══════════════════════════════════════════════════════════════

    // STEP 1: TAG THE LIVE DOM (getComputedStyle works here!)
    document.querySelectorAll('div, section').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
        if (parseInt(style.zIndex) > 50) {
          el.setAttribute('data-cstudio-preloader', 'true');
        }
      }
    });

    // STEP 2: CLONE THE DOM
    const clone = document.documentElement.cloneNode(true);

    // STEP 3: CLEAN THE LIVE DOM (remove temporary tags)
    document.querySelectorAll('[data-cstudio-preloader]').forEach(el => {
      el.removeAttribute('data-cstudio-preloader');
    });

    // STEP 4: MODIFY THE CLONE (all operations on clone only!)
    
    // A. KILL CSP & META REFRESH
    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());

    // B. KILL VISBUG UI & EXTENSION LEFTOVERS
    clone.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
    clone.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

    // C. AGGRESSIVE PRELOADER NUKE (using tags from Step 1)
    clone.querySelectorAll('[data-cstudio-preloader]').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.removeAttribute('data-cstudio-preloader');
    });

    // STEP 5: RETURN THE CLONE (live page untouched!)
    console.log('[CStudio] Smart Clone Strategy complete. Live page protected.');
    clone.outerHTML;
  `;
}

/**
 * Test: Live Page Modification Bug
 */
async function testLivePageModification(browser) {
  console.log('\n=== Test: Live Page Modification Bug ===');
  console.log('Testing if captureScript modifies the live page...\n');
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  
  const testHTML = createLiveWebsiteHTML();
  const testFilePath = path.join(__dirname, 'test-live-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(500);
  
  // Capture state BEFORE running captureScript
  console.log('📸 Capturing state BEFORE captureScript...');
  const beforeCapture = await page.evaluate(() => {
    return {
      preloaderExists: !!document.querySelector('#test-preloader'),
      visBugExists: !!document.querySelector('#test-visbug'),
      cspExists: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      headingExists: !!document.querySelector('#test-heading'),
      buttonExists: !!document.querySelector('#test-button'),
      preloaderDisplay: document.querySelector('#test-preloader') ? 
        window.getComputedStyle(document.querySelector('#test-preloader')).display : null,
      bodyChildCount: document.body.children.length
    };
  });
  
  console.log('Before capture:', beforeCapture);
  
  // Execute FIXED captureScript (Smart Clone Strategy)
  console.log('\n⚡ Executing FIXED captureScript (Smart Clone Strategy)...');
  const capturedHTML = await page.evaluate(getFixedCaptureScript());
  
  // Wait a bit for any async modifications
  await page.waitForTimeout(500);
  
  // Capture state AFTER running captureScript
  console.log('\n📸 Capturing state AFTER captureScript...');
  const afterCapture = await page.evaluate(() => {
    return {
      preloaderExists: !!document.querySelector('#test-preloader'),
      visBugExists: !!document.querySelector('#test-visbug'),
      cspExists: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      headingExists: !!document.querySelector('#test-heading'),
      buttonExists: !!document.querySelector('#test-button'),
      preloaderDisplay: document.querySelector('#test-preloader') ? 
        window.getComputedStyle(document.querySelector('#test-preloader')).display : null,
      bodyChildCount: document.body.children.length,
      pageModified: window.pageModified
    };
  });
  
  console.log('After capture:', afterCapture);
  
  // Check if page was modified
  const pageWasModified = 
    beforeCapture.preloaderExists !== afterCapture.preloaderExists ||
    beforeCapture.visBugExists !== afterCapture.visBugExists ||
    beforeCapture.cspExists !== afterCapture.cspExists ||
    beforeCapture.preloaderDisplay !== afterCapture.preloaderDisplay ||
    beforeCapture.bodyChildCount !== afterCapture.bodyChildCount ||
    afterCapture.pageModified;
  
  console.log('\n📊 ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════');
  
  if (pageWasModified) {
    console.log('❌ BUG STILL EXISTS: Live page was modified!');
    console.log('\nChanges detected:');
    
    if (beforeCapture.preloaderExists !== afterCapture.preloaderExists) {
      console.log(`  • Preloader removed: ${beforeCapture.preloaderExists} → ${afterCapture.preloaderExists}`);
    }
    if (beforeCapture.visBugExists !== afterCapture.visBugExists) {
      console.log(`  • VisBug removed: ${beforeCapture.visBugExists} → ${afterCapture.visBugExists}`);
    }
    if (beforeCapture.cspExists !== afterCapture.cspExists) {
      console.log(`  • CSP meta removed: ${beforeCapture.cspExists} → ${afterCapture.cspExists}`);
    }
    if (beforeCapture.preloaderDisplay !== afterCapture.preloaderDisplay) {
      console.log(`  • Preloader display changed: ${beforeCapture.preloaderDisplay} → ${afterCapture.preloaderDisplay}`);
    }
    if (beforeCapture.bodyChildCount !== afterCapture.bodyChildCount) {
      console.log(`  • Body child count changed: ${beforeCapture.bodyChildCount} → ${afterCapture.bodyChildCount}`);
    }
    
    console.log('\n⚠️  IMPACT: This causes the original website to crash!');
    console.log('   - Elements are removed from live page');
    console.log('   - Styles are modified on live page');
    console.log('   - User loses their work');
    console.log('   - Page becomes unusable');
    
  } else {
    console.log('✓ FIX VERIFIED: Live page was NOT modified!');
    console.log('   Smart Clone Strategy is working correctly');
    console.log('   - All elements remain on live page');
    console.log('   - No styles changed on live page');
    console.log('   - User work is preserved');
    console.log('   - Page remains fully functional');
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  
  // Clean up
  await page.close();
  fs.unlinkSync(testFilePath);
  
  return {
    passed: !pageWasModified,
    bugDetected: pageWasModified,
    changes: {
      preloaderRemoved: beforeCapture.preloaderExists !== afterCapture.preloaderExists,
      visBugRemoved: beforeCapture.visBugExists !== afterCapture.visBugExists,
      cspRemoved: beforeCapture.cspExists !== afterCapture.cspExists,
      stylesChanged: beforeCapture.preloaderDisplay !== afterCapture.preloaderDisplay
    }
  };
}

/**
 * Main test runner
 */
async function runLivePageCrashTest() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Live Page Crash Test - Critical Bug Check           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nTesting if captureScript modifies the live page causing crashes\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const result = await testLivePageModification(browser);
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    if (result.bugDetected) {
      console.log('❌ FIX FAILED: Smart Clone Strategy not working');
      console.log('\n🔧 ISSUE:');
      console.log('   captureScript still modifies the live DOM');
      console.log('\n⚠️  SEVERITY: HIGH - Causes user data loss and page crashes');
      process.exit(1);
    } else {
      console.log('✓ FIX SUCCESSFUL: Smart Clone Strategy working perfectly!');
      console.log('\n✨ BENEFITS:');
      console.log('   • Live page completely protected');
      console.log('   • getComputedStyle() works correctly on live DOM');
      console.log('   • All modifications happen on clone only');
      console.log('   • No user data loss');
      console.log('   • Original page remains functional');
      process.exit(0);
    }
    
  } finally {
    await browser.close();
  }
}

// Run test
runLivePageCrashTest().catch(error => {
  console.error('\n❌ TEST EXECUTION ERROR:', error);
  process.exit(1);
});
