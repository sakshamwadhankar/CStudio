/**
 * Simplified Bug Condition Test
 * 
 * This test captures the HTML and saves it to inspect the actual bug behavior
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testBug() {
  const browser = await puppeteer.launch({
    headless: false, // Run in visible mode to see what happens
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  
  // Create test HTML
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bug Test</title>
  <style>
    body { margin: 0; padding: 0; }
    .hero { height: 200px; background: #667eea; color: white; padding: 20px; }
    .hero-heading { font-size: 48px; }
  </style>
</head>
<body>
  <div class="hero">
    <h1 class="hero-heading opacity-0" style="opacity: 0;">Hero Heading</h1>
  </div>
  <div style="height: 1500px; padding: 50px;">
    <p class="opacity-0" style="opacity: 0; margin-top: 800px;">Below fold content</p>
  </div>
</body>
</html>`;
  
  const testFilePath = path.join(__dirname, 'test-page.html');
  fs.writeFileSync(testFilePath, testHTML);
  
  await page.goto(`file://${testFilePath}`);
  
  console.log('Initial hero heading opacity:', await page.evaluate(() => {
    const el = document.querySelector('.hero-heading');
    return {
      computed: window.getComputedStyle(el).opacity,
      inline: el.style.opacity,
      top: el.getBoundingClientRect().top
    };
  }));
  
  // Execute captureScript
  const capturedHTML = await page.evaluate(() => {
    const liveBase = window.location.origin;
    
    // Pre-reveal phase
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
            
            console.log('[Phantom] GSAP loaded, animating elements...');
            
            // BUG: Animates ALL elements without checking viewport position
            const elementsToAnimate = document.querySelectorAll('.cstudio-animate-me');
            console.log('[Phantom] Found', elementsToAnimate.length, 'elements to animate');
            
            elementsToAnimate.forEach(el => {
              const rect = el.getBoundingClientRect();
              console.log('[Phantom] Animating element at top:', rect.top);
              
              // This sets opacity back to 0!
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
  
  // Save captured HTML
  const capturedPath = path.join(__dirname, 'captured-page.html');
  fs.writeFileSync(capturedPath, capturedHTML);
  console.log('\nCaptured HTML saved to:', capturedPath);
  
  // Load captured HTML in new page
  const capturedPage = await browser.newPage();
  await capturedPage.setViewport({ width: 1200, height: 800 });
  
  // Enable console logging
  capturedPage.on('console', msg => {
    console.log('[Browser]', msg.text());
  });
  
  await capturedPage.goto(`file://${capturedPath}`);
  
  console.log('\nWaiting 1 second...');
  await capturedPage.waitForTimeout(1000);
  
  console.log('Hero heading opacity after 1s:', await capturedPage.evaluate(() => {
    const el = document.querySelector('.hero-heading');
    return {
      computed: window.getComputedStyle(el).opacity,
      inline: el.style.opacity,
      top: el.getBoundingClientRect().top
    };
  }));
  
  console.log('\nWaiting 2 more seconds...');
  await capturedPage.waitForTimeout(2000);
  
  console.log('Hero heading opacity after 3s:', await capturedPage.evaluate(() => {
    const el = document.querySelector('.hero-heading');
    return {
      computed: window.getComputedStyle(el).opacity,
      inline: el.style.opacity,
      top: el.getBoundingClientRect().top
    };
  }));
  
  console.log('\nPress Ctrl+C to exit...');
  await new Promise(() => {}); // Keep browser open
}

testBug().catch(console.error);
