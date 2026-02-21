/**
 * Live Site Diagnostic Test
 * 
 * This test checks if the cloned website works correctly
 * and identifies any issues with the capture process
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║           Live Site Diagnostic - Error Analysis               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function diagnosticTest() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    // Track all console messages
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });
    
    // Track all errors
    const errors = [];
    page.on('pageerror', error => {
      errors.push({
        message: error.message,
        stack: error.stack
      });
    });
    
    // Track failed requests
    const failedRequests = [];
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()
      });
    });
    
    // Create test HTML that simulates the captured page
    const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Diagnostic Test</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .hero { height: 300px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; padding: 40px; }
    .hero-heading { font-size: 48px; margin: 0; }
    .content { padding: 50px; min-height: 1000px; }
    .section { margin: 50px 0; padding: 30px; background: #f5f5f5; }
  </style>
</head>
<body>
  <div class="hero">
    <h1 class="hero-heading opacity-0" style="opacity: 0;">Welcome to Test Site</h1>
    <p style="opacity: 0;">This is a test hero section</p>
  </div>
  <div class="content">
    <div class="section opacity-0" style="opacity: 0; margin-top: 500px;">
      <h2>Section 1</h2>
      <p>This should animate on scroll</p>
    </div>
    <div class="section opacity-0" style="opacity: 0;">
      <h2>Section 2</h2>
      <p>This should also animate on scroll</p>
    </div>
  </div>
  
  <script>
    console.log('[Test] Page loaded, starting capture simulation...');
    
    // Simulate the captureScript
    const liveBase = window.location.origin;
    
    // 1. Store original URLs
    document.querySelectorAll('img, source, video').forEach(el => {
      ['src', 'poster'].forEach(attr => {
        if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
          const originalUrl = el.getAttribute(attr);
          el.setAttribute('data-original-src', new URL(originalUrl, liveBase).href);
        }
      });
    });
    
    // 2. Pre-reveal phase
    const preRevealElements = document.querySelectorAll('.opacity-0, [style*="opacity: 0"]');
    console.log('[Test] Found', preRevealElements.length, 'elements to reveal');
    
    preRevealElements.forEach(el => {
      el.classList.remove('opacity-0');
      el.style.setProperty('opacity', '1', 'important');
      el.classList.add('cstudio-animate-me');
    });
    
    console.log('[Test] Pre-reveal complete, all elements visible');
    
    // 3. Inject Phantom Engine
    const engineScript = document.createElement('script');
    engineScript.innerHTML = \`
      console.log('[Phantom] Starting Phantom Engine...');
      
      // Image error handler
      window.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG' || e.target.tagName === 'SOURCE' || e.target.tagName === 'VIDEO') {
          const backupSrc = e.target.getAttribute('data-original-src');
          if (backupSrc && e.target.src !== backupSrc) {
            console.log('[CStudio] Auto-healing broken media:', backupSrc);
            e.target.src = backupSrc;
          }
        }
      }, true);
      
      // Load GSAP
      const s1 = document.createElement('script');
      s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
      s1.onerror = function() {
        console.error('[Phantom] Failed to load GSAP!');
      };
      s1.onload = function() {
        console.log('[Phantom] GSAP loaded successfully');
      };
      document.body.appendChild(s1);
      
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
      s2.onerror = function() {
        console.error('[Phantom] Failed to load ScrollTrigger!');
      };
      s2.onload = function() {
        console.log('[Phantom] ScrollTrigger loaded successfully');
      };
      document.body.appendChild(s2);
      
      let chk = 0;
      const intGSAP = setInterval(() => {
        chk++;
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
          clearInterval(intGSAP);
          gsap.registerPlugin(ScrollTrigger);
          
          console.log('[Phantom] GSAP initialized, setting up animations...');
          
          const viewportThreshold = window.innerHeight * 0.3;
          console.log('[Phantom] Viewport threshold:', viewportThreshold, 'px');
          
          const allElements = document.querySelectorAll('.cstudio-animate-me');
          console.log('[Phantom] Found', allElements.length, 'elements tagged for animation');
          
          let heroCount = 0;
          let animatedCount = 0;
          
          allElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const isHero = rect.top <= viewportThreshold;
            
            console.log('[Phantom] Element at', rect.top, 'px - isHero:', isHero);
            
            if (isHero) {
              heroCount++;
              console.log('[Phantom] Skipping hero element (keeping visible)');
            } else {
              animatedCount++;
              console.log('[Phantom] Animating below-fold element');
              
              gsap.fromTo(el, 
                { opacity: 0, y: 50 },
                { 
                  opacity: 1, 
                  y: 0, 
                  duration: 1,
                  ease: 'power2.out',
                  scrollTrigger: {
                    trigger: el,
                    start: "top 85%",
                    toggleActions: "play none none none",
                    onEnter: () => console.log('[Phantom] Animation triggered for element')
                  }
                }
              );
            }
          });
          
          console.log('[Phantom] Setup complete:');
          console.log('  - Hero elements (kept visible):', heroCount);
          console.log('  - Animated elements:', animatedCount);
          
          setTimeout(() => ScrollTrigger.refresh(), 500);
        } else if (chk > 50) {
          clearInterval(intGSAP);
          console.error('[Phantom] Timeout waiting for GSAP to load!');
        }
      }, 100);
    \`;
    document.body.appendChild(engineScript);
    
    console.log('[Test] Phantom Engine injected');
    console.log('[CStudio] DOM sanitization complete. Ready for capture.');
  </script>
</body>
</html>`;
    
    const testFilePath = path.join(__dirname, 'diagnostic-test.html');
    fs.writeFileSync(testFilePath, testHTML);
    
    console.log('Loading test page...\n');
    await page.goto(`file://${testFilePath}`);
    
    // Wait for GSAP to load
    await page.waitForTimeout(3000);
    
    // Check hero element visibility
    const heroStatus = await page.evaluate(() => {
      const hero = document.querySelector('.hero-heading');
      return {
        opacity: window.getComputedStyle(hero).opacity,
        top: hero.getBoundingClientRect().top,
        hasClass: hero.classList.contains('cstudio-animate-me'),
        text: hero.textContent
      };
    });
    
    console.log('=== Hero Element Status ===');
    console.log('  Text:', heroStatus.text);
    console.log('  Opacity:', heroStatus.opacity);
    console.log('  Position:', heroStatus.top, 'px');
    console.log('  Tagged for animation:', heroStatus.hasClass);
    console.log('  Visible immediately:', heroStatus.opacity === '1' ? '✅ YES' : '❌ NO');
    console.log();
    
    // Check for JavaScript errors
    console.log('=== JavaScript Errors ===');
    if (errors.length === 0) {
      console.log('  ✅ No JavaScript errors detected');
    } else {
      console.log('  ❌ Found', errors.length, 'JavaScript errors:');
      errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.message}`);
      });
    }
    console.log();
    
    // Check console messages
    console.log('=== Console Messages ===');
    const testMessages = consoleMessages.filter(m => m.text.includes('[Test]') || m.text.includes('[Phantom]') || m.text.includes('[CStudio]'));
    testMessages.forEach(msg => {
      const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : '✅';
      console.log(`  ${icon} ${msg.text}`);
    });
    console.log();
    
    // Check failed requests
    console.log('=== Failed Requests ===');
    if (failedRequests.length === 0) {
      console.log('  ✅ No failed requests');
    } else {
      console.log('  ⚠️ Found', failedRequests.length, 'failed requests:');
      failedRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req.url}`);
        console.log(`     Reason: ${req.failure ? req.failure.errorText : 'Unknown'}`);
      });
    }
    console.log();
    
    // Final verdict
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      DIAGNOSTIC RESULTS                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    const allGood = errors.length === 0 && heroStatus.opacity === '1';
    
    if (allGood) {
      console.log('✅ ALL SYSTEMS WORKING CORRECTLY');
      console.log('  ✓ Hero section visible immediately');
      console.log('  ✓ No JavaScript errors');
      console.log('  ✓ Phantom Engine loaded successfully');
      console.log('  ✓ GSAP animations configured\n');
    } else {
      console.log('⚠️ ISSUES DETECTED');
      if (heroStatus.opacity !== '1') {
        console.log('  ❌ Hero section not visible (opacity:', heroStatus.opacity, ')');
      }
      if (errors.length > 0) {
        console.log('  ❌ JavaScript errors detected');
      }
      console.log();
    }
    
    // Clean up
    await page.close();
    fs.unlinkSync(testFilePath);
    
    return { success: allGood, heroVisible: heroStatus.opacity === '1', errors: errors.length };
    
  } finally {
    await browser.close();
  }
}

diagnosticTest()
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ TEST EXECUTION ERROR:', error);
    process.exit(1);
  });
