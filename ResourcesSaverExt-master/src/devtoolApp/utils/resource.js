import * as networkResourceActions from 'devtoolApp/store/networkResource';
import * as staticResourceActions from 'devtoolApp/store/staticResource';
import { flashStatus } from 'devtoolApp/store/ui';
import { resolveURLToPath } from './url';
import { debounce, logIfDev } from './general';
import * as downloadLogActions from '../store/downloadLog';

export const SOURCES = {
  STATIC: 'STATIC',
  NETWORK: 'NETWORK',
};

// ──────────────────────────────────────────────
// Version 4.1 – Privacy Shield: Tracking Blocklist
// ──────────────────────────────────────────────

export const TRACKING_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'doubleclick.net',
  'clarity.ms',
];

export const isBlockedUrl = (url) => {
  if (!url) return false;
  return TRACKING_DOMAINS.some((domain) => url.includes(domain));
};

// ──────────────────────────────────────────────
// Version 4.2 – Smart Data URI Handling
// ──────────────────────────────────────────────

export const MIN_SIZE_TO_EXTRACT = 10240; // 10KB threshold

/**
 * Estimate the byte size of resource content.
 * For base64: decoded size ≈ string length * 3/4
 * For strings: character count (1 byte per char approximation)
 * For Blobs: .size property
 */
const getContentSize = (content, encoding) => {
  if (!content) return 0;
  if (content instanceof Blob) return content.size;
  if (typeof content === 'string') {
    return encoding === 'base64' ? Math.floor(content.length * 3 / 4) : content.length;
  }
  return 0;
};

export const flashStatusDebounced = debounce((dispatch, message, timeout = 1000) => {
  logIfDev(`[FLASH STATUS]: ${message}`);
  dispatch(flashStatus(message, timeout));
}, 50);

// ──────────────────────────────────────────────
// Smart Patcher: CSS Sub‑Resource Discovery
// ──────────────────────────────────────────────

/**
 * Regex‑scan CSS content for url(...) references and return an array of
 * absolute URLs that should be fetched.
 */
export const extractCssSubResources = (cssContent, cssUrl) => {
  if (!cssContent || typeof cssContent !== 'string') return [];

  // Match url('...'), url("..."), and url(...) without quotes
  const urlRegex = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  const results = [];
  let match;

  while ((match = urlRegex.exec(cssContent)) !== null) {
    let ref = match[2].trim();

    // Skip empty, data URIs, blob URIs, and fragment-only refs
    if (!ref || ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('#')) {
      continue;
    }

    // Resolve relative paths against the CSS file's own URL
    try {
      const absolute = new URL(ref, cssUrl).href;
      results.push(absolute);
    } catch {
      console.log('[DEVTOOL]', 'Could not resolve CSS sub-resource URL:', ref);
    }
  }

  return results;
};

/**
 * Fetch a sub‑resource URL and dispatch it into the network resource store.
 */
export const fetchAndRegisterSubResource = (dispatch, absoluteUrl) => {
  flashStatusDebounced(dispatch, `[CSS-SUB] Fetching: ${absoluteUrl}`);

  fetch(absoluteUrl)
    .then(async (response) => {
      if (!response.ok) {
        console.log('[DEVTOOL]', `[CSS-SUB] Failed to fetch ${absoluteUrl}: ${response.status}`);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      const blob = await response.blob();

      const meta = {
        source: SOURCES.NETWORK,
        url: absoluteUrl,
        type: contentType.split(';')[0].trim(),
        content: blob,
        encoding: null,
        saveAs: resolveURLToPath(absoluteUrl, contentType, null),
      };

      dispatch(networkResourceActions.addNetworkResource(meta));
      console.log('[DEVTOOL]', `[CSS-SUB] Registered: ${absoluteUrl}`);
    })
    .catch((err) => {
      console.log('[DEVTOOL]', `[CSS-SUB] Error fetching ${absoluteUrl}:`, err);
    });
};

// ──────────────────────────────────────────────
// Version 4 – Deep Asset Extraction (HTML)
// ──────────────────────────────────────────────

/**
 * Regex‑scan HTML content for hidden asset references that browsers may not
 * fetch as network requests: favicons, Open Graph images, Apple touch icons.
 * Returns an array of absolute URLs.
 */
export const extractHiddenAssets = (htmlContent, pageUrl) => {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const results = [];

  // 1. Favicons: <link rel="icon" href="..."> and <link rel="shortcut icon" href="...">
  const faviconRegex = /<link[^>]+rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  // Also match when href comes before rel
  const faviconRegex2 = /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/gi;

  // 2. Apple Touch Icons: <link rel="apple-touch-icon" href="...">
  const appleTouchRegex = /<link[^>]+rel\s*=\s*["']apple-touch-icon(?:-precomposed)?["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const appleTouchRegex2 = /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']apple-touch-icon(?:-precomposed)?["'][^>]*>/gi;

  // 3. Open Graph Images: <meta property="og:image" content="...">
  const ogImageRegex = /<meta[^>]+property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const ogImageRegex2 = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*>/gi;

  const allRegexes = [
    faviconRegex, faviconRegex2,
    appleTouchRegex, appleTouchRegex2,
    ogImageRegex, ogImageRegex2,
  ];

  for (const regex of allRegexes) {
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
      let ref = match[1].trim();

      // Skip empty, data URIs, and blob URIs
      if (!ref || ref.startsWith('data:') || ref.startsWith('blob:')) {
        continue;
      }

      try {
        const absolute = new URL(ref, pageUrl).href;
        results.push(absolute);
      } catch {
        console.log('[DEVTOOL]', '[DEEP-ASSET] Could not resolve URL:', ref);
      }
    }
  }

  // Deduplicate within the returned set
  return [...new Set(results)];
};

// Shared set to track URLs we have already seen / queued across both stores
const _knownUrls = new Set();

/**
 * Helper to discover and fetch sub-resources from CSS content
 */
const discoverAndFetchCssSubResources = (dispatch, cssContent, cssUrl, existingUrls) => {
  const subUrls = extractCssSubResources(cssContent, cssUrl);
  for (const subUrl of subUrls) {
    if (!existingUrls.has(subUrl)) {
      existingUrls.add(subUrl); // prevent duplicate fetches
      fetchAndRegisterSubResource(dispatch, subUrl);
    }
  }
};

/**
 * Helper to discover and fetch hidden assets from HTML content (V4 Deep Asset Extraction)
 */
const discoverAndFetchHtmlHiddenAssets = (dispatch, htmlContent, htmlUrl, existingUrls) => {
  const assetUrls = extractHiddenAssets(htmlContent, htmlUrl);
  for (const assetUrl of assetUrls) {
    if (!existingUrls.has(assetUrl)) {
      existingUrls.add(assetUrl); // prevent duplicate fetches
      flashStatusDebounced(dispatch, `[DEEP-ASSET] Found: ${assetUrl}`);
      fetchAndRegisterSubResource(dispatch, assetUrl);
    }
  }
};

// ──────────────────────────────────────────────
// Original Resource Processing (with Hooks)
// ──────────────────────────────────────────────

export const processNetworkResourceToStore = (dispatch, res) => {
  if (isBlockedUrl(res.request?.url)) { console.log('[PRIVACY-SHIELD] Blocked:', res.request.url); return; }
  flashStatusDebounced(dispatch, `[NETWORK] Processing: ${res.request?.url || `No Url`}`);
  if (res.request?.url && !res.request.url.match(`^(debugger:|chrome-extension:|ws:)`)) {
    _knownUrls.add(res.request.url);

    res.getContent((content, encoding) => {
      // ── V4.2 Smart Data URI: skip small inline data URIs ──
      if (res.request.url.startsWith('data:') && getContentSize(content, encoding) < MIN_SIZE_TO_EXTRACT) {
        console.log('[SMART-DATA-URI] Skipped small Data URI (<10KB):', res.request.url.substring(0, 60) + '...');
        return;
      }

      const uriDataTypeMatches = res.request.url.match(/^data:(?<dataType>.*?);/);
      const uriDataType = uriDataTypeMatches?.groups?.dataType;
      const mimeType = res.response?.content?.mimeType;
      const contentTypeHeader = res.response?.headers?.find((i) => i.name.toLowerCase().includes('content-type'));
      const contentTypeMatches = contentTypeHeader?.value?.match(/^(?<contentType>.*?);/);
      const contentType = contentTypeMatches?.groups?.contentType;
      const type = uriDataType || mimeType || contentType;

      dispatch(
        networkResourceActions.addNetworkResource({
          source: SOURCES.NETWORK,
          url: res.request.url,
          type,
          content,
          encoding,
          origin: res,
          saveAs: resolveURLToPath(res.request.url, type, content),
        })
      );

      // ── Smart Patcher: discover CSS sub-resources ──
      if (
        typeof content === 'string' &&
        content.length > 0 &&
        (type?.includes('css') || type?.includes('stylesheet') || res.request.url.match(/\.css(\?|$)/i))
      ) {
        discoverAndFetchCssSubResources(dispatch, content, res.request.url, _knownUrls);
      }

      // ── V4 Deep Asset Extraction: discover hidden HTML assets ──
      if (
        typeof content === 'string' &&
        content.length > 0 &&
        (type?.includes('html') || type?.includes('document') || res.request.url.match(/\.(html?|xhtml)(\?|$)/i))
      ) {
        discoverAndFetchHtmlHiddenAssets(dispatch, content, res.request.url, _knownUrls);
      }
    });
  }
};

export const processStaticResourceToStore = (dispatch, res) => {
  if (isBlockedUrl(res.url)) { console.log('[PRIVACY-SHIELD] Blocked:', res.url); return; }
  if (!res.url.match(`^(debugger:|chrome-extension:|ws:)`)) {
    _knownUrls.add(res.url);

    flashStatusDebounced(dispatch, `[STATIC] Processing a resource: ${res.url || `No Url`}`);
    res.getContent(async (content, encoding) => {
      // ── V4.2 Smart Data URI: skip small inline data URIs ──
      if (res.url.startsWith('data:') && getContentSize(content, encoding) < MIN_SIZE_TO_EXTRACT) {
        console.log('[SMART-DATA-URI] Skipped small Data URI (<10KB):', res.url.substring(0, 60) + '...');
        return;
      }

      const meta = {
        source: SOURCES.STATIC,
        url: res.url,
        type: res.type,
        content,
        encoding,
        origin: res,
        saveAs: resolveURLToPath(res.url, res.type, content),
      };
      // If content is a promise
      if (content?.then) {
        try {
          meta.content = await content;
        } catch {
          meta.content = null;
          meta.failed = true;
        }
      }
      if (!meta.content && res.url.startsWith('http')) {
        console.debug(`[STATIC] ${res.url} No content from memory, try to fetch content directly: `, res.url);
        fetch(res.url)
          .then(async (retryRequest) => {
            if (retryRequest.ok) {
              meta.content = await retryRequest.blob();
            } else {
              meta.failed = true;
            }
            dispatch(staticResourceActions.addStaticResource(meta));

            // ── Smart Patcher: discover CSS sub-resources (Fetch fallback) ──
            if (meta.content && (res.type?.includes('css') || res.type?.includes('stylesheet') || res.url.match(/\.css(\?|$)/i))) {
              // We need to read the blob as text
              if (meta.content instanceof Blob) {
                const text = await meta.content.text();
                discoverAndFetchCssSubResources(dispatch, text, res.url, _knownUrls);
              }
            }

            // ── V4 Deep Asset Extraction: discover hidden HTML assets (Fetch fallback) ──
            if (meta.content && (res.type?.includes('html') || res.type?.includes('document') || res.url.match(/\.(html?|xhtml)(\?|$)/i))) {
              if (meta.content instanceof Blob) {
                const text = await meta.content.text();
                discoverAndFetchHtmlHiddenAssets(dispatch, text, res.url, _knownUrls);
              }
            }
          })
          .catch((err) => {
            console.log(`[STATIC]: Error ${res.url}`, err);
            meta.failed = true;
            dispatch(staticResourceActions.addStaticResource(meta));
          });
      } else {
        dispatch(staticResourceActions.addStaticResource(meta));

        // ── Smart Patcher: discover CSS sub-resources (Memory) ──
        if (
          typeof meta.content === 'string' &&
          meta.content.length > 0 &&
          (res.type?.includes('css') || res.type?.includes('stylesheet') || res.url.match(/\.css(\?|$)/i))
        ) {
          discoverAndFetchCssSubResources(dispatch, meta.content, res.url, _knownUrls);
        }

        // ── V4 Deep Asset Extraction: discover hidden HTML assets (Memory) ──
        if (
          typeof meta.content === 'string' &&
          meta.content.length > 0 &&
          (res.type?.includes('html') || res.type?.includes('document') || res.url.match(/\.(html?|xhtml)(\?|$)/i))
        ) {
          discoverAndFetchHtmlHiddenAssets(dispatch, meta.content, res.url, _knownUrls);
        }
      }
    });
  }
};

export const logResourceByUrl = (dispatch, url, resources) => {
  console.debug(`[ALL] Now log resource state from url: `, url);
  dispatch(
    downloadLogActions.addLogItem({
      url: url,
      logs: resources.map((i) => ({
        failed: i.failed,
        hasContent: !!i.content,
        url: i.url,
        saveAs: i.saveAs,
      })),
    })
  );
};
