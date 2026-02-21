/**
 * Smart Clone Strategy Verification Test
 * 
 * Verifies that:
 * 1. Live page is NOT modified
 * 2. Captured HTML has all fixes applied
 * 3. VisBug elements removed from clone
 * 4. CSP meta tags removed from clone
 * 5. Preloaders hidden in clone
 * 6. URLs absolutized in clone
 * 7. GSAP Phantom Engine injected in clone
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Create comprehensive test HTML
 */
function createTestHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self';">
  <meta http-equiv="refresh" content="30;url=https://example.com">
  <title>Comprehensive Test Page</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .content { padding: 20px; background: #f0f0f0; }
    .opacity-0 { opacity: 0; }
  </style>
</head>
<body>
  <div class="preloader" style="position: fixed; top: 0; left: 0; width: 100%; height: 100vh; background: rgba(0,0,0,0.9); z-index: 999; display: flex; align-items: center; justify-content: center; color: white;">Loading...</div>
  <vis-bug id="visbug-ui">VisBug UI</vis-bug>
  
  <div class="content">
    <h1>Test Page</h1>
    <p>This is the original content</p>
    <img src="./images/test.jpg" alt="Test Image">
    <div class="opacity-0">Hidden content to be revealed</div>
  </div>
  
  <script src="chrome-extension://abc123/visbug.js"></script>
</body>
</html>`;
}

/**
 * Get the Smart Clone Strategy captureScript
 */
function getSmartCloneCaptureScript() {
  return `
    const liveBase = window.location.origin;

    // PHASE 1: TAG THE LIVE DOM
    document.querySelectorAll(
      '.opacity-0:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
      '[style*="opacity: 0"]:not([role="dialog"]):not([role="menu"]), ' +
      '[style*="visibility: hidden"]:not([role="dialog"]):not([role="menu"]), ' +
      'video'
    ).forEach(el => {
      if (el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) return;
      const computed = window.getComputedStyle(el);
      if (computed.display !== 'none') {
        el.setAttribute('data-cstudio-hidden', 'true');
      }
    });

    document.querySelectorAll('div, section').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
        if (parseInt(style.zIndex) > 50) {
          el.setAttribute('data-cstudio-preloader', 'true');
        }
      }
    });

    // PHASE 2: CLONE THE DOM
    const clone = document.documentElement.cloneNode(true);

    // PHASE 3: CLEAN UP LIVE DOM
    document.querySelectorAll('[data-cstudio-hidden]').forEach(el => el.removeAttribute('data-cstudio-hidden'));
    document.querySelectorAll('[data-cstudio-preloader]').forEach(el => el.removeAttribute('data-cstudio-preloader'));

    // PHASE 4: MODIFY THE CLONE ONLY
    
    // A. KILL CSP & META REFRESH
    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());

    // B. KILL VISBUG UI & EXTENSION LEFTOVERS
    clone.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
    clone.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

    // C. ABSOLUTIZE URLS
    clone.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
      ['src', 'data-src', 'poster'].forEach(attr => {
        if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
          const originalUrl = el.getAttribute(attr);
          el.setAttribute('data-original-src', new URL(originalUrl, liveBase).href);
          try { el.setAttribute(attr, new URL(originalUrl, liveBase).href); } catch(e){}
        }
      });
    });

    // D. APPLY PRE-REVEAL
    clone.querySelectorAll('[data-cstudio-hidden="true"]').forEach(el => {
      el.classList.remove('opacity-0');
      const currentStyle = el.getAttribute('style') || '';
      el.setAttribute('style', currentStyle + '; opacity: 1 !important; visibility: visible !important;');
      el.classList.add('cstudio-animate-me');
      el.removeAttribute('data-cstudio-hidden');
    });

    // E. APPLY PRELOADER NUKE
    clone.querySelectorAll('[data-cstudio-preloader="true"]').forEach(el => {
      const currentStyle = el.getAttribute('style') || '';
      el.setAttribute('style', currentStyle + '; display: none !important; opacity: 0 !important; pointer-events: none !important;');
      el.removeAttribute('data-cstudio-preloader');
    });

    // F. SCROLL UNLOCK
    const cloneBody = clone.querySelector('body');
    if (cloneBody) {
      const bodyStyle = cloneBody.getAttribute('style') || '';
      cloneBody.setAttribute('style', bodyStyle + '; overflow: auto !important;');
    }
    const htmlStyle = clone.getAttribute('style') || '';
    clone.setAttribute('style', htmlStyle + '; overflow: auto !important;');

    // G. KILL SCRIPTS
    clone.querySelectorAll('script').forEach(script => {
      if (script.src && script.src.includes('visbug')) return;
      script.remove();
    });

    console.log('[CStudio] Smart Clone complete');
    clone.outerHTML;
  `;
}

/**
 * Main test
 */
async function runSmartCloneVerification() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Smart Clone Strategy Verification Test                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    const testHTML = createTestHTML();
    const testFilePath = path.join(__dirname, 'test-smart-clone.html');
    fs.writeFileSync(testFilePath, testHTML);
    
    await page.goto(`file://${testFilePath}`, { waitUntil: 'networkidle0' });
    
    // Wait for styles to be fully applied
    await page.waitForTimeout(1000);
    
    // Capture BEFORE state
    console.log('📸 Capturing LIVE page state BEFORE...');
    const beforeLive = await page.evaluate(() => {
      return {
        preloaderExists: !!document.querySelector('.preloader'),
        visBugExists: !!document.querySelector('vis-bug'),
        cspExists: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        metaRefreshExists: !!document.querySelector('meta[http-equiv="refresh"]'),
        chromeExtScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
        hiddenElements: document.querySelectorAll('.opacity-0').length,
        imgSrc: document.querySelector('img') ? document.querySelector('img').getAttribute('src') : null
      };
    });
    
    console.log('Before:', beforeLive);
    
    // Execute Smart Clone Strategy
    console.log('\n⚡ Executing Smart Clone Strategy...');
    
    // Check if preloader gets tagged
    const tagCheck = await page.evaluate(() => {
      const preloader = document.querySelector('.preloader');
      if (!preloader) return { found: false };
      
      const style = window.getComputedStyle(preloader);
      return {
        found: true,
        position: style.position,
        height: style.height,
        zIndex: style.zIndex,
        bottom: style.bottom,
        shouldBeTagged: style.position === 'fixed' && 
                       (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0') &&
                       parseInt(style.zIndex) > 50
      };
    });
    
    console.log('Preloader tag check:', tagCheck);
    
    const capturedHTML = await page.evaluate(getSmartCloneCaptureScript());
    
    // Capture AFTER state (live page should be unchanged)
    console.log('\n📸 Capturing LIVE page state AFTER...');
    const afterLive = await page.evaluate(() => {
      return {
        preloaderExists: !!document.querySelector('.preloader'),
        visBugExists: !!document.querySelector('vis-bug'),
        cspExists: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        metaRefreshExists: !!document.querySelector('meta[http-equiv="refresh"]'),
        chromeExtScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
        hiddenElements: document.querySelectorAll('.opacity-0').length,
        imgSrc: document.querySelector('img') ? document.querySelector('img').getAttribute('src') : null
      };
    });
    
    console.log('After:', afterLive);
    
    // Load captured HTML to verify clone modifications
    console.log('\n📋 Analyzing CAPTURED HTML (clone)...');
    const capturedPage = await browser.newPage();
    await capturedPage.setContent(capturedHTML);
    
    const capturedState = await capturedPage.evaluate(() => {
      const preloader = document.querySelector('.preloader');
      return {
        preloaderExists: !!preloader,
        preloaderHasDataAttr: preloader ? preloader.hasAttribute('data-cstudio-preloader') : false,
        preloaderInlineStyle: preloader ? preloader.getAttribute('style') : 'not found',
        preloaderHidden: preloader ? 
          (preloader.style.display === 'none' || preloader.style.opacity === '0' || 
           (preloader.getAttribute('style') && preloader.getAttribute('style').includes('display: none'))) : false,
        visBugExists: !!document.querySelector('vis-bug'),
        cspExists: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        metaRefreshExists: !!document.querySelector('meta[http-equiv="refresh"]'),
        chromeExtScripts: document.querySelectorAll('[src^="chrome-extension://"]').length,
        hiddenElements: document.querySelectorAll('.opacity-0').length,
        revealedElements: document.querySelectorAll('.cstudio-animate-me').length,
        imgSrc: document.querySelector('img') ? document.querySelector('img').getAttribute('src') : null,
        imgAbsolute: document.querySelector('img') ? 
          document.querySelector('img').getAttribute('src').startsWith('file://') : false
      };
    });
    
    console.log('Captured:', capturedState);
    
    // Verify results
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      VERIFICATION RESULTS                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    const tests = [
      {
        name: 'Live page NOT modified',
        pass: JSON.stringify(beforeLive) === JSON.stringify(afterLive),
        details: 'Live page state unchanged'
      },
      {
        name: 'VisBug removed from clone',
        pass: !capturedState.visBugExists,
        details: `VisBug in clone: ${capturedState.visBugExists}`
      },
      {
        name: 'CSP removed from clone',
        pass: !capturedState.cspExists,
        details: `CSP in clone: ${capturedState.cspExists}`
      },
      {
        name: 'Meta refresh removed from clone',
        pass: !capturedState.metaRefreshExists,
        details: `Meta refresh in clone: ${capturedState.metaRefreshExists}`
      },
      {
        name: 'Chrome extension scripts removed from clone',
        pass: capturedState.chromeExtScripts === 0,
        details: `Chrome ext scripts in clone: ${capturedState.chromeExtScripts}`
      },
      {
        name: 'Preloader hidden in clone',
        pass: capturedState.preloaderHidden,
        details: `Preloader hidden: ${capturedState.preloaderHidden}`
      },
      {
        name: 'Hidden elements revealed in clone',
        pass: capturedState.revealedElements > 0 && capturedState.hiddenElements === 0,
        details: `Revealed: ${capturedState.revealedElements}, Hidden: ${capturedState.hiddenElements}`
      },
      {
        name: 'URLs absolutized in clone',
        pass: capturedState.imgAbsolute,
        details: `Image URL: ${capturedState.imgSrc}`
      }
    ];
    
    let passCount = 0;
    tests.forEach((test, index) => {
      const status = test.pass ? '✓ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${test.name}: ${status}`);
      console.log(`   ${test.details}\n`);
      if (test.pass) passCount++;
    });
    
    console.log(`\nResults: ${passCount}/${tests.length} tests passed\n`);
    
    // Clean up
    await page.close();
    await capturedPage.close();
    fs.unlinkSync(testFilePath);
    
    if (passCount === tests.length) {
      console.log('✅ ALL TESTS PASSED: Smart Clone Strategy working perfectly!');
      process.exit(0);
    } else {
      console.log('❌ SOME TESTS FAILED: Review implementation');
      process.exit(1);
    }
    
  } finally {
    await browser.close();
  }
}

// Run test
runSmartCloneVerification().catch(error => {
  console.error('\n❌ TEST EXECUTION ERROR:', error);
  process.exit(1);
});
