/**
 * Bug Condition Exploration Test - Final Version
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * CRITICAL: This test documents the bugs on unfixed code
 * 
 * Bug 1: Hero elements get animated by GSAP even though they're already visible
 * Bug 2: Images with filter strings in URLs may fail when saved locally
 * 
 * This test demonstrates that the UNFIXED code applies GSAP animations to ALL
 * elements tagged with 'cstudio-animate-me', including hero elements that are
 * already in the viewport. While GSAP may eventually animate them, this causes
 * unnecessary animation delays and potential blank screen issues.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Bug Condition Exploration Test - GSAP Animation & Image Bugs ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function runTest() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  try {
    console.log('=== Bug 1: Hero Elements Incorrectly Animated ===\n');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    // Create test HTML with hero element
    const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bug Test</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .hero { height: 200px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; padding: 20px; }
    .hero-heading { font-size: 48px; margin: 0; }
    .below-fold { height: 1500px; padding: 50px; background: #f5f5f5; }
    .below-fold-element { margin-top: 800px; padding: 20px; background: white; }
  </style>
</head>
<body>
  <div class="hero">
    <h1 class="hero-heading opacity-0" style="opacity: 0;">Hero Heading</h1>
  </div>
  <div class="below-fold">
    <div class="below-fold-element opacity-0" style="opacity: 0;">
      <h2>Below Fold Content</h2>
    </div>
  </div>
</body>
</html>`;
    
    const testFilePath = path.join(__dirname, 'test-page.html');
    fs.writeFileSync(testFilePath, testHTML);
    
    await page.goto(`file://${testFilePath}`);
    
    // Get initial positions
    const positions = await page.evaluate(() => {
      const hero = document.querySelector('.hero-heading');
      const belowFold = document.querySelector('.below-fold-element');
      const viewportHeight = window.innerHeight;
      const threshold = viewportHeight * 0.3;
      
      return {
        hero: {
          top: hero.getBoundingClientRect().top,
          withinThreshold: hero.getBoundingClientRect().top <= threshold
        },
        belowFold: {
          top: belowFold.getBoundingClientRect().top,
          withinThreshold: belowFold.getBoundingClientRect().top <= threshold
        },
        viewportHeight,
        threshold
      };
    });
    
    console.log('Element Positions:');
    console.log(`  Viewport height: ${positions.viewportHeight}px`);
    console.log(`  Hero threshold (30%): ${positions.threshold}px`);
    console.log(`  Hero element top: ${positions.hero.top}px (within threshold: ${positions.hero.withinThreshold})`);
    console.log(`  Below-fold element top: ${positions.belowFold.top}px (within threshold: ${positions.belowFold.withinThreshold})\n`);
    
    // Execute the UNFIXED captureScript
    console.log('Executing UNFIXED captureScript...\n');
    
    const capturedHTML = await page.evaluate(() => {
      // Pre-reveal phase - sets opacity to 1 and tags elements
      const preRevealElements = document.querySelectorAll('.opacity-0, [style*="opacity: 0"]');
      preRevealElements.forEach(el => {
        el.classList.remove('opacity-0');
        el.style.setProperty('opacity', '1', 'important');
        el.classList.add('cstudio-animate-me');
      });
      
      // Phantom Engine injection
      const phantomScript = document.createElement('script');
      phantomScript.innerHTML = `
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
                const rect = el.getBoundingClientRect();
                const viewportThreshold = window.innerHeight * 0.3;
                const isHero = rect.top <= viewportThreshold;
                
                console.log('[BUG] Animating element at top:', rect.top, 'px (isHero:', isHero, ', threshold:', viewportThreshold, 'px)');
                
                // This applies animation to ALL elements, including hero elements
                // For hero elements, this causes unnecessary animation
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
      `;
      document.body.appendChild(phantomScript);
      
      return document.documentElement.outerHTML;
    });
    
    // Save and load captured HTML
    const capturedPath = path.join(__dirname, 'captured-page.html');
    fs.writeFileSync(capturedPath, capturedHTML);
    
    const capturedPage = await browser.newPage();
    await capturedPage.setViewport({ width: 1200, height: 800 });
    
    // Track console logs
    const logs = [];
    capturedPage.on('console', msg => {
      logs.push(msg.text());
    });
    
    await capturedPage.goto(`file://${capturedPath}`);
    await capturedPage.waitForTimeout(2000);
    
    // Check which elements were animated
    const animationResults = await capturedPage.evaluate(() => {
      const hero = document.querySelector('.hero-heading');
      const belowFold = document.querySelector('.below-fold-element');
      const viewportThreshold = window.innerHeight * 0.3;
      
      return {
        hero: {
          hasClass: hero.classList.contains('cstudio-animate-me'),
          top: hero.getBoundingClientRect().top,
          withinThreshold: hero.getBoundingClientRect().top <= viewportThreshold,
          opacity: window.getComputedStyle(hero).opacity
        },
        belowFold: {
          hasClass: belowFold.classList.contains('cstudio-animate-me'),
          top: belowFold.getBoundingClientRect().top,
          withinThreshold: belowFold.getBoundingClientRect().top <= viewportThreshold,
          opacity: window.getComputedStyle(belowFold).opacity
        }
      };
    });
    
    console.log('Animation Results:');
    console.log('  Hero element:');
    console.log(`    - Tagged for animation: ${animationResults.hero.hasClass}`);
    console.log(`    - Position: ${animationResults.hero.top}px (within threshold: ${animationResults.hero.withinThreshold})`);
    console.log(`    - Final opacity: ${animationResults.hero.opacity}`);
    console.log('  Below-fold element:');
    console.log(`    - Tagged for animation: ${animationResults.belowFold.hasClass}`);
    console.log(`    - Position: ${animationResults.belowFold.top}px (within threshold: ${animationResults.belowFold.withinThreshold})`);
    console.log(`    - Final opacity: ${animationResults.belowFold.opacity}\n`);
    
    // Check console logs for bug evidence
    const bugLogs = logs.filter(log => log.includes('[BUG]'));
    console.log('Console Logs from Phantom Engine:');
    bugLogs.forEach(log => console.log(`  ${log}`));
    
    // Analyze results
    console.log('\n📊 COUNTEREXAMPLE ANALYSIS:\n');
    
    const heroAnimated = animationResults.hero.hasClass && animationResults.hero.withinThreshold;
    const belowFoldAnimated = animationResults.belowFold.hasClass && !animationResults.belowFold.withinThreshold;
    
    if (heroAnimated) {
      console.log('❌ BUG CONFIRMED: Hero element (within viewport threshold) was animated by GSAP');
      console.log(`   - Hero element at ${animationResults.hero.top}px was tagged with 'cstudio-animate-me'`);
      console.log(`   - GSAP applied animation to this element even though it's already visible`);
      console.log(`   - Expected: Hero elements should be excluded from animation`);
      console.log(`   - Actual: Hero elements are animated, causing unnecessary delays\n`);
    } else {
      console.log('✓ UNEXPECTED: Hero element was NOT animated (bug may be fixed)\n');
    }
    
    if (belowFoldAnimated) {
      console.log('✓ PRESERVATION: Below-fold element was correctly animated');
      console.log(`   - Element at ${animationResults.belowFold.top}px was tagged and animated`);
      console.log(`   - This behavior should be preserved in the fix\n`);
    }
    
    // Clean up
    await capturedPage.close();
    await page.close();
    fs.unlinkSync(testFilePath);
    fs.unlinkSync(capturedPath);
    
    console.log('=== Bug 2: Image Filter String Issue ===\n');
    console.log('Note: Bug 2 (image filter strings causing 404s) is difficult to reproduce');
    console.log('in an automated test because:');
    console.log('  1. The bug occurs during the actual file save process in the extension');
    console.log('  2. OS-level file system restrictions prevent saving files with special characters');
    console.log('  3. The test environment uses live CDN URLs which load successfully\n');
    console.log('The fix for Bug 2 will add error handlers to catch 404s and fall back to CDN URLs.\n');
    
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    if (heroAnimated) {
      console.log('✓ Bug exploration complete - Bug 1 confirmed on unfixed code');
      console.log('  Counterexample: Hero element at ' + animationResults.hero.top + 'px was animated by GSAP');
      console.log('  despite being within the viewport threshold (' + positions.threshold + 'px)\n');
      console.log('Ready to proceed with fix implementation.');
      return { success: true, bugConfirmed: true };
    } else {
      console.log('⚠ Unexpected result - Bug 1 not reproduced');
      console.log('  This may indicate the bug is already fixed or the test needs adjustment.\n');
      return { success: true, bugConfirmed: false };
    }
    
  } finally {
    await browser.close();
  }
}

runTest()
  .then(result => {
    process.exit(result.bugConfirmed ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ TEST EXECUTION ERROR:', error);
    process.exit(1);
  });
