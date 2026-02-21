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

                // ═══════════════════════════════════════════════════════════════
                // SMART CLONE STRATEGY 🧠
                // Protects live page while using getComputedStyle() correctly
                // ═══════════════════════════════════════════════════════════════

                // STEP 1: TAG THE LIVE DOM (getComputedStyle works here!)
                // Tag preloaders that need to be hidden
                document.querySelectorAll('div, section').forEach(el => {
                  const style = window.getComputedStyle(el);
                  if (style.position === 'fixed' && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
                    if (parseInt(style.zIndex) > 50) {
                      el.setAttribute('data-cstudio-preloader', 'true');
                    }
                  }
                });

                // Tag old-style preloaders (z-index > 1000, bottom = 0)
                document.querySelectorAll('div').forEach(div => {
                  const style = window.getComputedStyle(div);
                  if (style.position === 'fixed' && parseInt(style.zIndex) > 1000 && parseInt(style.bottom) === 0) {
                    div.setAttribute('data-cstudio-preloader', 'true');
                  }
                });

                // Tag hidden elements for pre-reveal
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
                  el.setAttribute('data-cstudio-hidden', 'true');
                });

                // STEP 2: CLONE THE DOM
                const clone = document.documentElement.cloneNode(true);

                // STEP 3: CLEAN THE LIVE DOM (remove temporary tags)
                document.querySelectorAll('[data-cstudio-preloader]').forEach(el => {
                  el.removeAttribute('data-cstudio-preloader');
                });
                document.querySelectorAll('[data-cstudio-hidden]').forEach(el => {
                  el.removeAttribute('data-cstudio-hidden');
                });

                // STEP 4: MODIFY THE CLONE (all operations on clone only!)
                
                // A. KILL CSP & META REFRESH (Allows our CDN scripts to run)
                clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());

                // B. KILL VISBUG UI & EXTENSION LEFTOVERS (Fixes 'invalid/' error & invisible shields)
                clone.querySelectorAll('vis-bug, #visbug').forEach(el => el.remove());
                clone.querySelectorAll('[src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

                // C. AGGRESSIVE PRELOADER NUKE (using tags from Step 1)
                clone.querySelectorAll('[data-cstudio-preloader]').forEach(el => {
                  el.style.setProperty('display', 'none', 'important');
                  el.style.setProperty('opacity', '0', 'important');
                  el.style.setProperty('pointer-events', 'none', 'important');
                  el.removeAttribute('data-cstudio-preloader');
                });

                // D. STORE ORIGINAL URLS & AGGRESSIVE ABSOLUTIZATION (Fixes 404s)
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

                // E. PRE-REVEAL & SCROLL UNLOCK (using tags from Step 1)
                clone.querySelectorAll('[data-cstudio-hidden]').forEach(el => {
                  el.classList.remove('opacity-0');
                  el.style.setProperty('opacity', '1', 'important');
                  el.style.setProperty('visibility', 'visible', 'important');
                  el.style.setProperty('transform', 'none', 'important');
                  el.classList.add('cstudio-animate-me');
                  el.removeAttribute('data-cstudio-hidden');
                });

                const cloneHtml = clone.querySelector('html');
                const cloneBody = clone.querySelector('body');
                if (cloneHtml) {
                  cloneHtml.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                  cloneHtml.style.setProperty('overflow', 'auto', 'important');
                }
                if (cloneBody) {
                  cloneBody.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
                  cloneBody.style.setProperty('overflow', 'auto', 'important');
                }

                // F. THE ABSOLUTE NUKE (Kill native scripts on clone)
                clone.querySelectorAll('script').forEach(script => {
                  if (script.src && script.src.includes('visbug')) return;
                  script.remove();
                });
                clone.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach(el => el.remove());

                // G. THE SELF-HEALING & SAFE PHANTOM ENGINE (inject into clone)
                const cloneBodyEl = clone.querySelector('body');
                if (cloneBodyEl) {
                  const engineScript = document.createElement('script');
                  engineScript.innerHTML = \`
                    // A. Image Self-Healing Fallback
                    window.addEventListener('error', function(e) {
                      if (e.target.tagName === 'IMG' || e.target.tagName === 'SOURCE') {
                        const backupSrc = e.target.getAttribute('data-original-src');
                        if (backupSrc && e.target.src !== backupSrc) {
                          console.log('[CStudio] Auto-healing broken image:', backupSrc);
                          e.target.src = backupSrc;
                        }
                      }
                    }, true);

                    // B. Load GSAP
                    const s1 = document.createElement('script');
                    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
                    document.body.appendChild(s1);
                    
                    const s2 = document.createElement('script');
                    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
                    document.body.appendChild(s2);
                    
                    let chk = 0;
                    const intGSAP = setInterval(() => {
                      chk++;
                      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
                        clearInterval(intGSAP);
                        gsap.registerPlugin(ScrollTrigger);
                        
                        document.documentElement.style.setProperty('overflow', 'auto', 'important');
                        document.body.style.setProperty('overflow', 'auto', 'important');

                        const viewportThreshold = window.innerHeight * 0.3;

                        document.querySelectorAll('.cstudio-animate-me').forEach(el => {
                          // CRITICAL FIX: Only animate elements BELOW the initial viewport
                          const rect = el.getBoundingClientRect();
                          if (rect.top > viewportThreshold) {
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
                                  toggleActions: "play none none none"
                                }
                              }
                            );
                          }
                        });
                        setTimeout(() => ScrollTrigger.refresh(), 500);
                      } else if (chk > 50) clearInterval(intGSAP);
                    }, 100);
                  \`;
                  cloneBodyEl.appendChild(engineScript);
                }

                // STEP 5: RETURN THE CLONE (live page untouched!)
                console.log('[CStudio] Smart Clone Strategy complete. Live page protected.');
                clone.outerHTML;
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
