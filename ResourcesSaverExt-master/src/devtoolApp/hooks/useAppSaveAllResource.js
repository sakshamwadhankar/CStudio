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
        // Phase 3: DOM Snapshot Engine + V3.0 Smart Shield
        // ──────────────────────────────────────────────
        // Capture the "Live" HTML for the main page to fix empty React/Next.js shells.
        // In V3.0 mode, inject Smart Shield + force entry.client to wake up GSAP animations.

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
              // The V3.0 Smart Shield Strategy:
              // 1. Force absolute URLs for proper resource mapping
              // 2. Inject Smart Shield that allows GSAP innerHTML but blocks React hydration
              // 3. Resurrect all preload scripts
              // 4. Force-inject the missing entry.client script
              const captureScript = `
                // 1. Force Absolute URLs to fix broken media paths
                document.querySelectorAll('link[href], script[src], img[src], source[src], a[href]').forEach(el => {
                  if (el.hasAttribute('href')) el.href = el.href;
                  if (el.hasAttribute('src')) el.src = el.src;
                });
                
                // 2. The Smart Anti-Hydration Shield (Allows GSAP, Blocks React Hydration)
                const shieldScript = document.createElement('script');
                shieldScript.innerHTML = "const _ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'); Object.defineProperty(Element.prototype, 'innerHTML', { set: function (v) { if (this.classList && (this.classList.contains('gsap-split') || this.hasAttribute('data-gsap'))) { _ih.set.call(this, v); return; } console.log('[CStudio Shield] Blocked innerHTML'); }, get: _ih.get }); const _tx = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent'); Object.defineProperty(Node.prototype, 'textContent', { set: function(v) { }, get: _tx.get }); const _nv = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'nodeValue'); Object.defineProperty(CharacterData.prototype, 'nodeValue', { set: function(v) { }, get: _nv.get });";
                document.head.insertBefore(shieldScript, document.head.firstChild);
                
                // 3. Resurrect ALL preloads
                document.querySelectorAll('link[rel="modulepreload"][href], link[rel="preload"][as="script"][href]').forEach(link => {
                  const src = link.href;
                  if (!document.querySelector('script[src="' + src + '"]')) {
                    const script = document.createElement('script');
                    script.type = 'module';
                    script.src = src;
                    script.crossOrigin = '';
                    document.body.appendChild(script);
                  }
                });
                
                // 4. FORCE-INJECT the missing Entry Client (The Main Engine)
                const entryHints = Array.from(document.querySelectorAll('link[href*="entry.client"]'));
                if (entryHints.length > 0) {
                  const entrySrc = entryHints[0].href;
                  if (!document.querySelector('script[src="' + entrySrc + '"]')) {
                    const entryScript = document.createElement('script');
                    entryScript.type = 'module';
                    entryScript.src = entrySrc;
                    entryScript.crossOrigin = '';
                    document.body.appendChild(entryScript);
                  }
                }
                
                document.documentElement.outerHTML;
              `;
              
              chrome.devtools.inspectedWindow.eval(
                captureScript,
                (result, isException) => {
                  if (isException) {
                    console.log('[DEVTOOL] DOM Snapshot failed:', isException);
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
                console.log('[DEVTOOL] V3.0 Mode: Smart Shield + Entry.Client injection applied - GSAP will animate, React hydration blocked');
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
