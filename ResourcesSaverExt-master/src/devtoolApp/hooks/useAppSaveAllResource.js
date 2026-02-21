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
                // 1. AGGRESSIVE ABSOLUTIZATION (Fix all image 404s)
                
                // Standard src attributes
                document.querySelectorAll('img[src], source[src], video[src], audio[src], track[src], embed[src], iframe[src]').forEach(el => {
                  if (el.hasAttribute('src')) el.src = el.src;
                });
                
                // AGGRESSIVE srcset handling (responsive images)
                document.querySelectorAll('img[srcset], source[srcset]').forEach(el => {
                  if (el.hasAttribute('srcset')) {
                    const srcset = el.getAttribute('srcset');
                    const absoluteSrcset = srcset.split(',').map(part => {
                      const trimmed = part.trim();
                      const spaceIndex = trimmed.search(/\\s+/);
                      if (spaceIndex === -1) {
                        // No descriptor, just URL
                        return new URL(trimmed, window.location.href).href;
                      } else {
                        // URL + descriptor (e.g., "image.jpg 2x")
                        const url = trimmed.substring(0, spaceIndex);
                        const descriptor = trimmed.substring(spaceIndex);
                        return new URL(url, window.location.href).href + descriptor;
                      }
                    }).join(', ');
                    el.setAttribute('srcset', absoluteSrcset);
                  }
                });
                
                // AGGRESSIVE data-srcset handling (lazy loading)
                document.querySelectorAll('[data-srcset]').forEach(el => {
                  if (el.hasAttribute('data-srcset')) {
                    const srcset = el.getAttribute('data-srcset');
                    const absoluteSrcset = srcset.split(',').map(part => {
                      const trimmed = part.trim();
                      const spaceIndex = trimmed.search(/\\s+/);
                      if (spaceIndex === -1) {
                        return new URL(trimmed, window.location.href).href;
                      } else {
                        const url = trimmed.substring(0, spaceIndex);
                        const descriptor = trimmed.substring(spaceIndex);
                        return new URL(url, window.location.href).href + descriptor;
                      }
                    }).join(', ');
                    el.setAttribute('data-srcset', absoluteSrcset);
                  }
                });
                
                // Video poster images
                document.querySelectorAll('video[poster]').forEach(el => {
                  if (el.hasAttribute('poster')) {
                    el.poster = el.poster;
                  }
                });
                
                // Links and stylesheets
                document.querySelectorAll('link[href], a[href]').forEach(el => {
                  if (el.hasAttribute('href')) el.href = el.href;
                });
                
                // Scripts
                document.querySelectorAll('script[src]').forEach(el => {
                  if (el.hasAttribute('src')) el.src = el.src;
                });
                
                // Lazy-loaded images (data-src pattern)
                document.querySelectorAll('[data-src]').forEach(el => {
                  const dataSrc = el.getAttribute('data-src');
                  if (dataSrc && !dataSrc.startsWith('data:')) {
                    const absoluteUrl = new URL(dataSrc, window.location.href).href;
                    el.setAttribute('data-src', absoluteUrl);
                  }
                });
                
                // Background images in inline styles
                document.querySelectorAll('[style*="background"]').forEach(el => {
                  const style = el.getAttribute('style');
                  if (style && style.includes('url(')) {
                    const updatedStyle = style.replace(/url\\(['"]?([^'"\\)]+)['"]?\\)/g, (match, url) => {
                      if (url.startsWith('data:') || url.startsWith('http')) return match;
                      const absoluteUrl = new URL(url, window.location.href).href;
                      return 'url("' + absoluteUrl + '")';
                    });
                    el.setAttribute('style', updatedStyle);
                  }
                });
                
                // 2. THE EXECUTIONER (Fix blank screen & remove tracking)
                console.log('[CStudio] Starting aggressive script cleanup...');
                
                document.querySelectorAll('script').forEach(script => {
                  let shouldRemove = false;
                  
                  // Check inline script content for fatal patterns
                  if (script.innerHTML) {
                    const content = script.innerHTML;
                    if (
                      content.includes('streamController') ||
                      content.includes('__reactRouterContext') ||
                      content.includes('__remixContext') ||
                      content.includes('__remixManifest') ||
                      content.includes('__remixRouteModules') ||
                      content.includes('window.__remixRouter')
                    ) {
                      shouldRemove = true;
                      console.log('[CStudio] Removing fatal inline script:', content.substring(0, 100));
                    }
                  }
                  
                  // Check external script src for tracking/analytics
                  if (script.src) {
                    const src = script.src.toLowerCase();
                    if (
                      src.includes('hs-scripts') ||
                      src.includes('hubspot') ||
                      src.includes('collectedforms') ||
                      src.includes('embed.js') ||
                      src.includes('analytics') ||
                      src.includes('gtag') ||
                      src.includes('google-analytics') ||
                      src.includes('googletagmanager') ||
                      src.includes('facebook.net') ||
                      src.includes('doubleclick') ||
                      src.includes('hotjar')
                    ) {
                      shouldRemove = true;
                      console.log('[CStudio] Removing tracking script:', script.src);
                    }
                  }
                  
                  if (shouldRemove) {
                    script.remove();
                  }
                });
                
                // 3. The Hydration Nuke (Kill React gracefully)
                const rootDiv = document.getElementById('root') || document.querySelector('[data-reactroot]') || document.querySelector('#app');
                if (rootDiv) {
                  rootDiv.id = 'cstudio-isolated-root';
                  rootDiv.removeAttribute('data-reactroot');
                }
                
                // 4. Clean the Crime Scene (Remove their broken modules and our old shields)
                document.querySelectorAll('link[rel="modulepreload"], script[type="module"]').forEach(el => el.remove());
                document.querySelectorAll('script').forEach(s => {
                  if (s.innerHTML.includes('CStudio Shield') || s.innerHTML.includes('Phantom Engine')) s.remove();
                });
                
                // 5. THE PHANTOM ENGINE (Inject our own standalone GSAP to bypass their React constraints)
                const phantomScript = document.createElement('script');
                phantomScript.innerHTML = \`
                  (function() {
                    // Load Core GSAP
                    const s1 = document.createElement('script');
                    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
                    document.body.appendChild(s1);
                    
                    // Load ScrollTrigger
                    const s2 = document.createElement('script');
                    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
                    document.body.appendChild(s2);
                    
                    // Wait for both scripts to load
                    let gsapLoaded = false;
                    let scrollTriggerLoaded = false;
                    
                    s1.onload = () => { gsapLoaded = true; checkReady(); };
                    s2.onload = () => { scrollTriggerLoaded = true; checkReady(); };
                    
                    function checkReady() {
                      if (gsapLoaded && scrollTriggerLoaded && typeof gsap !== 'undefined') {
                        initPhantomEngine();
                      }
                    }
                    
                    function initPhantomEngine() {
                      gsap.registerPlugin(ScrollTrigger);
                      console.log("🏴‍☠️ CStudio Phantom Engine Activated!");
                      
                      // Smart selector: only animate elements that are INTENTIONALLY hidden for scroll reveals
                      // Exclude: modals, dropdowns, tooltips, nav menus
                      const hiddenElements = document.querySelectorAll(
                        '.opacity-0:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
                        '[style*="opacity: 0"]:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
                        '[style*="visibility: hidden"]:not([role="dialog"]):not([role="menu"]):not([role="tooltip"]), ' +
                        'video, ' +
                        '[data-gsap], [data-scroll], [data-animate]'
                      );
                      
                      hiddenElements.forEach(el => {
                        // Skip if element is inside a modal/dropdown container
                        if (el.closest('[role="dialog"], [role="menu"], .modal, .dropdown')) return;
                        
                        // Skip if element has display:none (truly hidden, not for animation)
                        const computed = window.getComputedStyle(el);
                        if (computed.display === 'none') return;
                        
                        // Strip their restrictive CSS
                        el.classList.remove('opacity-0');
                        el.style.removeProperty('visibility');
                        el.style.removeProperty('opacity');
                        
                        // Apply our own Premium Scroll Animation with delay to ensure GSAP is ready
                        setTimeout(() => {
                          gsap.from(el, {
                            opacity: 0,
                            y: 80,
                            duration: 1.2,
                            ease: "power3.out",
                            scrollTrigger: {
                              trigger: el,
                              start: "top 85%",
                              toggleActions: "play none none reverse"
                            }
                          });
                        }, 100);
                      });
                      
                      // Refresh ScrollTrigger after all animations are set
                      setTimeout(() => {
                        ScrollTrigger.refresh();
                      }, 500);
                    }
                  })();
                \`;
                document.body.appendChild(phantomScript);
                
                console.log('[CStudio] DOM sanitization complete. Ready for capture.');
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
