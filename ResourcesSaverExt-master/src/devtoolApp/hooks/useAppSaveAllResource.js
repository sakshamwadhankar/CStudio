import { useCallback, useEffect, useRef } from 'react';
import * as uiActions from '../store/ui';
import { downloadZipFile, resolveDuplicatedResources } from '../utils/file';
import { logResourceByUrl } from '../utils/resource';
import { resetNetworkResource } from '../store/networkResource';
import { resetStaticResource } from '../store/staticResource';
import { INITIAL_STATE as UI_INITIAL_STATE } from '../store/ui';
import useStore from '../store';

/**
 * Delay (ms) to wait after page load for any in‑flight CSS sub‑resource
 * fetches to complete and land in the store before we build the ZIP.
 */
const SUB_RESOURCE_SETTLE_MS = 1500;

export const useAppSaveAllResource = () => {
  const { state, dispatch } = useStore();
  const { networkResource, staticResource } = state;
  const networkResourceRef = useRef(networkResource);
  const staticResourceRef = useRef(staticResource);
  const {
    downloadList,
    option: { ignoreNoContentFile, beautifyFile },
    ui: { tab },
  } = state;

  const handleOnSave = useCallback(async () => {
    dispatch(uiActions.setIsSaving(true));
    for (let i = 0; i < downloadList.length; i++) {
      const downloadItem = downloadList[i];
      dispatch(uiActions.setSavingIndex(i));
      await new Promise(async (resolve) => {
        let loaded = true;
        if (i > 0 || tab?.url !== downloadItem.url) {
          loaded = await new Promise((r) => {
            const tabChangeHandler = (tabId, changeInfo) => {
              if (tabId !== chrome.devtools.inspectedWindow.tabId || !changeInfo || !changeInfo.status) {
                return;
              }
              if (changeInfo.status === 'loading') {
                return;
              }
              if (changeInfo.status === 'complete') {
                setTimeout(() => {
                  r(true);
                }, 2000);
              } else {
                r(false);
              }
              chrome.tabs.onUpdated.removeListener(tabChangeHandler);
            };
            chrome.tabs.onUpdated.addListener(tabChangeHandler);
            setTimeout(function () {
              dispatch(uiActions.setTab({ url: downloadItem.url }));
              chrome.tabs.update(chrome.devtools.inspectedWindow.tabId, { url: downloadItem.url });
            }, 500);
          });
        }

        // ── Smart Patcher: settle delay ──
        // Wait for CSS sub-resource fetches to complete before building ZIP.
        dispatch(uiActions.setStatus('Waiting for CSS sub-resources to settle...'));
        await new Promise((r) => setTimeout(r, SUB_RESOURCE_SETTLE_MS));

        // Re-read refs AFTER the settle delay so newly discovered sub-resources
        // are included in the final download list.
        const toDownload = resolveDuplicatedResources([
          ...(networkResourceRef.current || []),
          ...(staticResourceRef.current || []),
        ]);

        // ──────────────────────────────────────────────
        // Phase 3: DOM Snapshot Engine + V3.0 Phantom Engine
        // ──────────────────────────────────────────────
        // Capture the "Live" HTML for the main page to fix empty React/Next.js shells.
        // In V3.0 mode, kill React, strip broken modules, inject fresh GSAP from CDN.

        const version = localStorage.getItem('resources-saver-version');
        const isV3Mode = version === '3';

        // Find the resource that matches the current page URL
        const mainPageUrl = downloadItem.url;
        // Match loosely to handle trailing slashes or subtle URL differences
        const mainResource = toDownload.find(
          (r) => r.url === mainPageUrl || r.url.replace(/\/$/, '') === mainPageUrl.replace(/\/$/, '')
        );

        if (mainResource) {
          dispatch(uiActions.setStatus(isV3Mode ? 'Capturing edited DOM (V3.0)...' : 'Snapshotting live DOM...'));
          try {
            const capturedDOM = await new Promise((resolveDOM) => {
              // The V3.0 Phantom Engine Strategy:
              // 1. Force absolute URLs for proper resource mapping
              // 2. Kill React hydration (Hydration Nuke)
              // 3. Remove all broken module scripts
              // 4. Inject our own GSAP Phantom Engine from CDN
              const captureScript = `
                const liveBase = window.location.origin;
                
                // 1. BULLETPROOF MEDIA URLS (Force Live CDN to completely avoid local 404s)
                document.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
                  ['src', 'data-src', 'poster'].forEach(attr => {
                    if (el.hasAttribute(attr) && !el.getAttribute(attr).startsWith('data:')) {
                      try {
                        const originalUrl = el.getAttribute(attr);
                        const absoluteUrl = new URL(originalUrl, liveBase).href;
                        
                        // Store original URL for error handler fallback (Bug Fix: Image 404s)
                        if (el.tagName.toLowerCase() === 'img' && attr === 'src') {
                          el.setAttribute('data-original-src', absoluteUrl);
                        }
                        
                        el.setAttribute(attr, absoluteUrl);
                      } catch(e){}
                    }
                  });
                  ['srcset', 'data-srcset'].forEach(attr => {
                    if (el.hasAttribute(attr)) {
                      const absoluteSrcset = el.getAttribute(attr).split(',').map(part => {
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
                
                document.querySelectorAll('link[href], a[href]').forEach(el => {
                  if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('data:')) {
                    try { el.href = new URL(el.getAttribute('href'), liveBase).href; } catch(e){}
                  }
                });
                
                // 2. THE ABSOLUTE NUKE (Kill all native scripts & fix blank screen crashes)
                document.querySelectorAll('script').forEach(script => {
                  if (script.src && script.src.includes('visbug')) return;
                  script.remove();
                });
                document.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach(el => el.remove());
                
                // 3. PRE-REVEAL & SCROLL UNLOCKER (Execute BEFORE taking outerHTML snapshot)
                console.log('[CStudio] Executing Pre-Reveal & Scroll Unlock...');
                
                // A. Scroll Unlocker (Kill Lenis before capture)
                document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                document.body.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                document.documentElement.style.setProperty('overflow', 'auto', 'important');
                document.body.style.setProperty('overflow', 'auto', 'important');
                document.documentElement.style.setProperty('height', 'auto', 'important');
                document.body.style.setProperty('height', 'auto', 'important');

                // B. Hide rogue full-screen preloaders getting captured
                document.querySelectorAll('div').forEach(div => {
                  const style = window.getComputedStyle(div);
                  if (style.position === 'fixed' && parseInt(style.zIndex) > 1000 && parseInt(style.bottom) === 0) {
                    div.style.setProperty('display', 'none', 'important');
                  }
                });

                // C. PRE-REVEAL: Force visibility so saved HTML is instantly visible on load
                const preRevealElements = document.querySelectorAll(
                  '.opacity-0:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
                  '[style*="opacity: 0"]:not([role="dialog"]):not([role="menu"]), ' +
                  '[style*="visibility: hidden"]:not([role="dialog"]):not([role="menu"]), ' +
                  'video'
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
                
                // D. IMAGE ERROR HANDLER (Self-Healing for 404s)
                document.querySelectorAll('img').forEach(img => {
                  img.addEventListener('error', () => {
                    if (img.dataset.originalSrc && img.src !== img.dataset.originalSrc) {
                      img.src = img.dataset.originalSrc;
                    }
                  });
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
                        
                        document.documentElement.style.setProperty('overflow', 'auto', 'important');
                        document.body.style.setProperty('overflow', 'auto', 'important');
                        
                        // Calculate viewport threshold (30% of viewport height)
                        const viewportThreshold = window.innerHeight * 0.3;
                        
                        // Filter elements to exclude hero section (elements within viewport threshold)
                        const allElements = document.querySelectorAll('.cstudio-animate-me');
                        const elementsToAnimate = Array.from(allElements).filter(el => {
                          const rect = el.getBoundingClientRect();
                          return rect.top > viewportThreshold;
                        });
                        
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
              
              chrome.devtools.inspectedWindow.eval(
                captureScript,
                (result, isException) => {
                  if (isException) {
                    console.log('[DEVTOOL] DOM Snapshot failed:', isException);
                    
                    // Check if it's an extension context invalidation error
                    if (isException.code === 'E_PROTOCOLERROR' || 
                        (isException.description && isException.description.includes('context invalidated'))) {
                      console.error('[DEVTOOL] Extension context invalidated. Please close and reopen DevTools.');
                      dispatch(uiActions.setStatus('ERROR: Extension context invalidated. Close and reopen DevTools.'));
                    }
                    
                    resolveDOM(null);
                  } else {
                    resolveDOM(result);
                  }
                }
              );
            });

            if (capturedDOM) {
              let finalHTML = capturedDOM;

              // Ensure DOCTYPE is present
              if (!finalHTML.trim().toLowerCase().startsWith('<!doctype')) {
                finalHTML = '<!DOCTYPE html>\n' + finalHTML;
              }

              console.log('[DEVTOOL] Overwriting main page content with Live DOM Snapshot');
              if (isV3Mode) {
                console.log('[DEVTOOL] V3.0 Mode: Phantom Engine injected - React killed, GSAP CDN loaded, animations resurrected');
              }
              // This overrides the empty "Network Shell" with the actual rendered HTML
              mainResource.content = finalHTML;
            }
          } catch (err) {
            console.log('[DEVTOOL] Error during DOM snapshot:', err);
          }
        }
        // ──────────────────────────────────────────────

        console.log(toDownload.filter(t => typeof t?.content !== 'string' && !!t?.content?.then));
        if (loaded && toDownload.length) {
          downloadZipFile(
            toDownload,
            { ignoreNoContentFile, beautifyFile },
            (item, isDone) => {
              dispatch(uiActions.setStatus(`Compressed: ${item.url} Processed: ${isDone}`));
            },
            () => {
              logResourceByUrl(dispatch, downloadItem.url, toDownload);
              if (i + 1 !== downloadList.length) {
                dispatch(resetNetworkResource());
                dispatch(resetStaticResource());
              }
              resolve();
            }
          );
        }
      });
    }
    dispatch(uiActions.setStatus(UI_INITIAL_STATE.status));
    dispatch(uiActions.setIsSaving(false));
  }, [state, dispatch, tab]);

  useEffect(() => {
    networkResourceRef.current = networkResource;
  }, [networkResource]);

  useEffect(() => {
    staticResourceRef.current = staticResource;
  }, [staticResource]);

  return { handleOnSave };
};
