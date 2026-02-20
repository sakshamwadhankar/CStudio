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
        // Phase 3: DOM Snapshot Engine
        // ──────────────────────────────────────────────
        // Capture the "Live" HTML for the main page to fix empty React/Next.js shells.

        // Find the resource that matches the current page URL
        const mainPageUrl = downloadItem.url;
        // Match loosely to handle trailing slashes or subtle URL differences
        const mainResource = toDownload.find(
          (r) => r.url === mainPageUrl || r.url.replace(/\/$/, '') === mainPageUrl.replace(/\/$/, '')
        );

        if (mainResource) {
          dispatch(uiActions.setStatus('Snapshotting live DOM...'));
          try {
            const capturedDOM = await new Promise((resolveDOM) => {
              // serializeToString(document) captures the full DOM including Doctype
              chrome.devtools.inspectedWindow.eval(
                'new XMLSerializer().serializeToString(document)',
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
              console.log('[DEVTOOL] Overwriting main page content with Live DOM Snapshot');
              // This overrides the empty "Network Shell" with the actual rendered HTML
              mainResource.content = capturedDOM;
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
