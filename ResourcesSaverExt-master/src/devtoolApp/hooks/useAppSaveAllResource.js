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
                (function() {
                  const auditLog = {
                    status: "SUCCESS",
                    visBugEditsSaved: 0,
                    preloadersDestroyed: 0,
                    hiddenElementsRevealed: 0,
                    mediaUrlsFixed: 0,
                    blurPlaceholdersRemoved: 0,
                    reactScriptsNuked: 0,
                    errors: []
                  };

                  try {
                    const liveBase = window.location.origin;

                    // 1. Tag Hidden & Preloaders
                    document.querySelectorAll('.opacity-0, [style*="opacity: 0"], [style*="visibility: hidden"], video').forEach(el => {
                      if (!el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) {
                        const comp = window.getComputedStyle(el);
                        if (comp && comp.display !== 'none') {
                          el.setAttribute('data-cstudio-hidden', 'true');
                          auditLog.hiddenElementsRevealed++;
                        }
                      }
                    });

                    document.querySelectorAll('div, section').forEach(el => {
                      const style = window.getComputedStyle(el);
                      if (style && style.position === 'fixed' && parseInt(style.zIndex) > 40 && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0' || style.backgroundColor === 'rgb(0, 0, 0)')) {
                        el.setAttribute('data-cstudio-preloader', 'true');
                        auditLog.preloadersDestroyed++;
                      }
                    });

                    // 2. CAPTURE VISBUG EDITS (THE BULLETPROOF WAY - NEVER DROP THIS!)
                    document.querySelectorAll('*').forEach(el => {
                      if (el.hasAttribute('style') || (el.style && el.style.length > 0)) {
                        el.setAttribute('data-cstudio-visbug-style', el.style.cssText || el.getAttribute('style'));
                        auditLog.visBugEditsSaved++;
                      }
                    });

                    // 3. CLONE DOM 
                    const clone = document.documentElement.cloneNode(true);

                    // 4. Clean Live DOM (So user sees no trace)
                    document.querySelectorAll('[data-cstudio-hidden], [data-cstudio-preloader], [data-cstudio-visbug-style]').forEach(el => {
                      el.removeAttribute('data-cstudio-hidden');
                      el.removeAttribute('data-cstudio-preloader');
                      el.removeAttribute('data-cstudio-visbug-style');
                    });

                    // 5. RESTORE VISBUG EDITS ON CLONE
                    clone.querySelectorAll('[data-cstudio-visbug-style]').forEach(el => {
                      const savedStyle = el.getAttribute('data-cstudio-visbug-style');
                      if (savedStyle) {
                        el.setAttribute('style', savedStyle);
                      }
                      el.removeAttribute('data-cstudio-visbug-style');
                    });

                    // 6. SANITIZE CLONE
                    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());
                    clone.querySelectorAll('vis-bug, #visbug, [src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"]').forEach(el => el.remove());

                    // ABSOLUTE SCRIPT NUKE (Zero Tolerance Policy)
                    clone.querySelectorAll('script').forEach(script => {
                      if (script.src && script.src.includes('visbug')) return;
                      if (script.innerHTML && script.innerHTML.includes('CStudio')) return;
                      script.remove();
                      auditLog.reactScriptsNuked++;
                    });
                    
                    // Kill module preloads and eagerly loaded assets
                    clone.querySelectorAll('link[rel="modulepreload"], link[as="script"], link[rel="prefetch"], link[rel="preload"]').forEach(el => {
                      if(el.href && (el.href.includes('.js') || el.href.includes('.mjs'))) el.remove();
                    });
                    
                    // Kill inline state variables
                    clone.querySelectorAll('#__NEXT_DATA__, #__nuxt, [id^="__next"]').forEach(el => {
                      if(el.tagName === 'SCRIPT' || el.tagName === 'TEMPLATE') { 
                        el.remove(); 
                        auditLog.reactScriptsNuked++; 
                      }
                    });

                    // STRIP INLINE EVENT HANDLERS (Kills "Ghost" JS execution like onload=)
                    clone.querySelectorAll('*').forEach(el => {
                      if (el.attributes) {
                        for (let i = el.attributes.length - 1; i >= 0; i--) {
                          const attrName = el.attributes[i].name.toLowerCase();
                          if (attrName.startsWith('on')) {
                            el.removeAttribute(attrName);
                          }
                        }
                      }
                    });

                    // FIXED: SMART URL ABSOLUTIZATION (Never break existing external links!)
                    clone.querySelectorAll('img, source, video, audio, track, embed, iframe').forEach(el => {
                      ['src', 'data-src', 'poster'].forEach(attr => {
                        if (el.hasAttribute(attr)) {
                          const originalUrl = el.getAttribute(attr).trim();
                          if (!originalUrl.startsWith('data:') && !originalUrl.startsWith('http') && !originalUrl.startsWith('//')) {
                            try {
                              const absUrl = new URL(originalUrl, liveBase).href;
                              el.setAttribute('data-original-src', absUrl);
                              el.setAttribute(attr, absUrl);
                              auditLog.mediaUrlsFixed++;
                            } catch(e) { 
                              auditLog.errors.push("URL Fix Failed: " + originalUrl); 
                            }
                          }
                        }
                      });
                      ['srcset', 'data-srcset'].forEach(attr => {
                        if (el.hasAttribute(attr)) {
                          const originalSrcset = el.getAttribute(attr);
                          const absoluteSrcset = originalSrcset.split(',').map(part => {
                            const trimmed = part.trim();
                            if (trimmed.startsWith('data:') || trimmed.startsWith('http') || trimmed.startsWith('//')) return part;
                            const spaceIdx = trimmed.search(/\\s+/);
                            try {
                              auditLog.mediaUrlsFixed++;
                              if (spaceIdx === -1) return new URL(trimmed, liveBase).href;
                              return new URL(trimmed.substring(0, spaceIdx), liveBase).href + trimmed.substring(spaceIdx);
                            } catch(e) { return part; }
                          }).join(', ');
                          el.setAttribute(attr, absoluteSrcset);
                        }
                      });
                    });

                    // THE BLUR KILLER 
                    clone.querySelectorAll('*').forEach(el => {
                      let blurFixed = false;
                      if (el.style) {
                        if (el.style.filter && el.style.filter.includes('blur')) { 
                          el.style.removeProperty('filter'); 
                          blurFixed = true; 
                        }
                        if (el.style.backdropFilter && el.style.backdropFilter.includes('blur')) { 
                          el.style.removeProperty('backdrop-filter'); 
                          blurFixed = true; 
                        }
                        if (el.tagName === 'IMG') {
                          el.style.removeProperty('color');
                          if (el.style.backgroundImage && el.style.backgroundImage.includes('data:image')) {
                            el.style.removeProperty('background-image');
                            el.style.removeProperty('background-size');
                            blurFixed = true;
                          }
                          el.removeAttribute('loading');
                          el.removeAttribute('decoding');
                        }
                      }
                      if (el.className && typeof el.className === 'string') {
                        const orig = el.className;
                        el.className = el.className.replace(/\\b(blur-[a-z0-9]+|backdrop-blur-[a-z0-9]+|blur)\\b/g, '').trim();
                        if (orig !== el.className) blurFixed = true;
                      }
                      if (blurFixed) auditLog.blurPlaceholdersRemoved++;
                    });

                    // A. PRE-REVEAL ELEMENTS
                    clone.querySelectorAll('[data-cstudio-hidden="true"]').forEach(el => {
                      el.classList.remove('opacity-0');
                      el.style.setProperty('opacity', '1', 'important');
                      el.style.setProperty('visibility', 'visible', 'important');
                      el.style.setProperty('transform', 'none', 'important');
                      el.classList.add('cstudio-animate-me');
                      el.removeAttribute('data-cstudio-hidden');
                    });

                    // B. NUKE THE PRELOADERS
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

                    // C. ABSOLUTE NUKE: KILL REACT / NEXT.JS SCRIPTS
                    clone.querySelectorAll('script').forEach(script => {
                      if (script.src && script.src.includes('visbug')) return;
                      if (script.innerHTML && script.innerHTML.includes('CStudio')) return;
                      script.remove();
                      auditLog.reactScriptsNuked++;
                    });
                    clone.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach(el => el.remove());
                    clone.querySelectorAll('#__NEXT_DATA__, #__nuxt, [id^="__next"]').forEach(el => {
                      if(el.tagName === 'SCRIPT') { 
                        el.remove(); 
                        auditLog.reactScriptsNuked++; 
                      }
                    });

                    // 7. INJECT PHANTOM ENGINE & DIAGNOSTIC REPORT
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
                                el.style.removeProperty('opacity');
                                el.style.removeProperty('transform');
                                gsap.fromTo(el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: el, start: "top 85%" } });
                              }
                            });
                            setTimeout(() => ScrollTrigger.refresh(), 500);
                          } else if (chk > 50) clearInterval(intGSAP);
                        }, 100);

                        // === THE DIAGNOSTIC DASHBOARD ===
                        setTimeout(() => {
                          console.groupCollapsed('%c🚀 CStudio Diagnostic Report (Click to Expand)', 'color: #00FF00; background: #000; padding: 5px 10px; border-radius: 4px; font-weight: bold;');
                          console.table(\` + JSON.stringify(auditLog) + \`);
                          console.log("%c💡 Troubleshooting Guide:", "color: #FFD700; font-weight: bold;");
                          console.log("- Animations Missing? Check if GSAP CDN is blocked by AdBlock or CSP.");
                          console.log("- Edits Missing? Check 'visBugEditsSaved'. If 0, Visbug was not active.");
                          console.log("- Vue/React Errors in Console? Try testing in an Incognito Window to avoid cached Service Workers.");
                          console.groupEnd();
                        }, 2000);
                      \`;
                      body.appendChild(engineScript);
                    }

                    // Return HTML with hidden Audit Log comment at the very top
                    return "<!--\\nCSTUDIO DIAGNOSTIC LOG:\\n" + JSON.stringify(auditLog, null, 2) + "\\n-->\\n" + clone.outerHTML;
                  } catch (err) {
                    return "<!--\\nCSTUDIO CAPTURE ERROR: " + err.message + "\\n-->\\n" + document.documentElement.outerHTML;
                  }
                })();
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
