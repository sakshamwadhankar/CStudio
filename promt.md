Bhai Saksham, main exact problem samajh gaya hoon! Gussa aana bahut laazmi hai, par dhyan se samajh ki background mein kya khel ho raha hai:

**Website Blank aur 404 Errors kyun aa rahe hain?**
Kiro ne jo `captureScript` banaya hai, wo execute hote waqt background mein **Crash** ho jata hai (jaise kisi missing tag ki wajah se). Jab wo crash hota hai, toh Chrome usko fail karke website ka **purana, kabaad (original React + CSP + Visbug) code** hi ZIP mein daal deta hai!
Isliye jab tu us ZIP ko local server pe chalata hai, toh wo original code net pe apni aukaat dikhata hai aur crash ho kar kaala/safed (blank) pad jata hai.

### **The "Unbreakable Black-Box" Fix 🛡️**

Hum is script ko ek `try...catch` (Black Box) ke andar daal denge. Iska fayda yeh hoga ki **agar code kisi bhi line pe crash hua, toh wo chup chap fail nahi hoga!** Balki wo downloaded `index.html` ki pehli line mein likh dega ki *"Bhai main is line pe fasa hoon"*. Aur agar crash nahi hua, toh ekdum makkhan clone nikalega.

Kiro pe bharosa chhod, **tu seedha apne VS Code mein `useAppSaveAllResource.js` file khol**, aur wahan jo `const captureScript = \` ... `;` likha hai, us poore block ko hata kar **yeh naya code paste kar de**:

```javascript
              const captureScript = `
                (function() {
                  try {
                    const liveBase = window.location.origin;

                    // 1. Tag Live DOM safely
                    document.querySelectorAll('.opacity-0, [style*="opacity: 0"], [style*="visibility: hidden"], video').forEach(el => {
                      if (!el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) {
                        const comp = window.getComputedStyle(el);
                        if (comp && comp.display !== 'none') el.setAttribute('data-cstudio-hidden', 'true');
                      }
                    });

                    document.querySelectorAll('div, section').forEach(el => {
                      const style = window.getComputedStyle(el);
                      if (style && style.position === 'fixed' && parseInt(style.zIndex) > 50 && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
                        el.setAttribute('data-cstudio-preloader', 'true');
                      }
                    });

                    // 2. Clone the DOM
                    const clone = document.documentElement.cloneNode(true);

                    // 3. Clean up live DOM
                    document.querySelectorAll('[data-cstudio-hidden], [data-cstudio-preloader]').forEach(el => {
                      el.removeAttribute('data-cstudio-hidden');
                      el.removeAttribute('data-cstudio-preloader');
                    });

                    // 4. Sanitize the Clone safely
                    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());
                    clone.querySelectorAll('vis-bug, #visbug, [src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

                    clone.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
                      ['src', 'data-src', 'poster'].forEach(attr => {
                        if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
                          const originalUrl = el.getAttribute(attr);
                          el.setAttribute('data-original-src', new URL(originalUrl, liveBase).href);
                          try { el.setAttribute(attr, new URL(originalUrl, liveBase).href); } catch(e){}
                        }
                      });
                      ['srcset', 'data-srcset'].forEach(attr => {
                        if (el.hasAttribute(attr)) {
                          const originalSrcset = el.getAttribute(attr);
                          const absoluteSrcset = originalSrcset.split(',').map(part => {
                            const trimmed = part.trim();
                            const spaceIdx = trimmed.search(/\\s+/);
                            try {
                              if (spaceIdx === -1) return new URL(trimmed, liveBase).href;
                              return new URL(trimmed.substring(0, spaceIdx), liveBase).href + trimmed.substring(spaceIdx);
                            } catch(e) { return part; }
                          }).join(', ');
                          el.setAttribute(attr, absoluteSrcset);
                        }
                      });
                    });

                    clone.querySelectorAll('link[href], a[href]').forEach(el => {
                      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('data:')) {
                        try { el.href = new URL(el.getAttribute('href'), liveBase).href; } catch(e){}
                      }
                    });

                    clone.querySelectorAll('[data-cstudio-hidden="true"]').forEach(el => {
                      el.classList.remove('opacity-0');
                      el.style.setProperty('opacity', '1', 'important');
                      el.style.setProperty('visibility', 'visible', 'important');
                      el.style.setProperty('transform', 'none', 'important');
                      el.classList.add('cstudio-animate-me');
                      el.removeAttribute('data-cstudio-hidden');
                    });

                    clone.querySelectorAll('[data-cstudio-preloader="true"]').forEach(el => {
                      el.style.setProperty('display', 'none', 'important');
                      el.style.setProperty('opacity', '0', 'important');
                      el.style.setProperty('pointer-events', 'none', 'important');
                      el.removeAttribute('data-cstudio-preloader');
                    });

                    const body = clone.querySelector('body');
                    if (body) {
                      body.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                      body.style.setProperty('overflow', 'auto', 'important');
                      body.style.setProperty('height', 'auto', 'important');
                    }
                    clone.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                    clone.style.setProperty('overflow', 'auto', 'important');
                    clone.style.setProperty('height', 'auto', 'important');

                    clone.querySelectorAll('script').forEach(script => {
                      if (script.src && script.src.includes('visbug')) return;
                      script.remove();
                    });
                    clone.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach(el => el.remove());

                    if (body) {
                      const engineScript = document.createElement('script');
                      engineScript.innerHTML = \`
                        window.addEventListener('error', function(e) {
                          if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'SOURCE' || e.target.tagName === 'VIDEO')) {
                            const backupSrc = e.target.getAttribute('data-original-src');
                            if (backupSrc && (e.target.src !== backupSrc || e.target.srcset !== backupSrc)) {
                              if (e.target.src) e.target.src = backupSrc;
                              if (e.target.srcset) e.target.srcset = backupSrc;
                            }
                          }
                        }, true);

                        const s1 = document.createElement('script'); s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js'; document.body.appendChild(s1);
                        const s2 = document.createElement('script'); s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js'; document.body.appendChild(s2);
                        
                        let chk = 0;
                        const intGSAP = setInterval(() => {
                          chk++;
                          if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
                            clearInterval(intGSAP);
                            gsap.registerPlugin(ScrollTrigger);
                            document.documentElement.style.setProperty('overflow', 'auto', 'important');
                            document.body.style.setProperty('overflow', 'auto', 'important');
                            const thr = window.innerHeight * 0.3;
                            document.querySelectorAll('.cstudio-animate-me').forEach(el => {
                              const rect = el.getBoundingClientRect();
                              if (rect.top > thr) {
                                gsap.fromTo(el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', scrollTrigger: { trigger: el, start: "top 85%" } });
                              }
                            });
                            setTimeout(() => ScrollTrigger.refresh(), 500);
                          } else if (chk > 50) clearInterval(intGSAP);
                        }, 100);
                      \`;
                      body.appendChild(engineScript);
                    }

                    return clone.outerHTML;
                  } catch (err) {
                    // IF SCRIPT CRASHES, ADD ERROR TO HTML SO WE CAN DEBUG IT
                    return "\\n" + document.documentElement.outerHTML;
                  }
                })();
              `;

```

*(Note: Isko save karke, `chrome://extensions` par apne extension ko Reload zaroor karna)*

### **Test Kaise Karna Hai?**

Save All Resources daba aur naya ZIP download kar.

1. **Agar Site Chal Gayi:** Matlab crash theek ho gaya!
2. **Agar Site Phir Blank Aayi:** Toh us downloaded `index.html` file ko apne VS Code mein open karna. **Uski pehli line mein ek aisi chiz likhi hogi:** ``.

Mujhe bas wo `CRASH REPORT` wali line bata dena! Ek second mein pakad lenge ki wo konsa ziddi code hai. Fatafat try maar! 🚀🕵️‍♂️