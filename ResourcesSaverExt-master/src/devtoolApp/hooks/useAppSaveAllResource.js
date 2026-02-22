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
                  try {
                    const liveBase = window.location.origin;

                    // 1. TAG LIVE DOM (Smart Clone Strategy)
                    document.querySelectorAll('.opacity-0, [style*="opacity: 0"], [style*="visibility: hidden"], video').forEach(el => {
                      if (!el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) {
                        const comp = window.getComputedStyle(el);
                        if (comp && comp.display !== 'none') el.setAttribute('data-cstudio-hidden', 'true');
                      }
                    });

                    // Tag ziddi Black Preloaders
                    document.querySelectorAll('div, section').forEach(el => {
                      const style = window.getComputedStyle(el);
                      if (style && style.position === 'fixed' && parseInt(style.zIndex) > 50 && (style.height === '100vh' || style.height === '100%' || style.bottom === '0px' || style.bottom === '0')) {
                        el.setAttribute('data-cstudio-preloader', 'true');
                      }
                    });

                    // 2. CAPTURE VISBUG EDITS BEFORE CLONING
                    // VisBug adds inline styles, so we need to preserve them
                    const visbugEditedElements = [];
                    document.querySelectorAll('[style]').forEach(el => {
                      // Store element path and its inline styles
                      const path = [];
                      let current = el;
                      while (current && current !== document.documentElement) {
                        const parent = current.parentElement;
                        if (parent) {
                          const index = Array.from(parent.children).indexOf(current);
                          path.unshift({ tag: current.tagName, index: index });
                        }
                        current = parent;
                      }
                      visbugEditedElements.push({
                        path: path,
                        styles: el.style.cssText
                      });
                    });

                    // 3. CLONE DOM 
                    const clone = document.documentElement.cloneNode(true);

                    // 4. RESTORE VISBUG EDITS TO CLONE
                    visbugEditedElements.forEach(item => {
                      try {
                        let element = clone;
                        for (const step of item.path) {
                          const children = element.children;
                          if (children[step.index] && children[step.index].tagName === step.tag) {
                            element = children[step.index];
                          } else {
                            return; // Path not found, skip
                          }
                        }
                        // Apply the captured inline styles
                        if (element && item.styles) {
                          element.setAttribute('style', item.styles);
                        }
                      } catch (e) {
                        // Skip if path resolution fails
                      }
                    });

                    // 5. CLEAN LIVE DOM
                    document.querySelectorAll('[data-cstudio-hidden], [data-cstudio-preloader]').forEach(el => {
                      el.removeAttribute('data-cstudio-hidden');
                      el.removeAttribute('data-cstudio-preloader');
                    });

                    // 6. SANITIZE CLONE
                    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="refresh"]').forEach(el => el.remove());
                    clone.querySelectorAll('vis-bug, #visbug, [src^="chrome-extension://"], [href^="chrome-extension://"], [src^="invalid/"], [href^="invalid/"]').forEach(el => el.remove());

                    // Fix images 404s
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

                    // Fix link hrefs
                    clone.querySelectorAll('link[href], a[href]').forEach(el => {
                      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('data:')) {
                        try { el.href = new URL(el.getAttribute('href'), liveBase).href; } catch(e){}
                      }
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

                    // C. ABSOLUTE NUKE: KILL REACT SSR MODULES
                    clone.querySelectorAll('script').forEach(script => {
                      if (script.src && script.src.includes('visbug')) return;
                      script.remove();
                    });
                    clone.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach(el => el.remove());

                    // 5. INJECT PHANTOM ENGINE
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
                                gsap.fromTo(el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: el, start: "top 85%" } });
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
                    // IF SCRIPT CRASHES, RETURN ORIGINAL HTML WITH CRASH REPORT
                    return "<!-- CSTUDIO CRASH REPORT: " + err.message + " -->\n" + document.documentElement.outerHTML;
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
