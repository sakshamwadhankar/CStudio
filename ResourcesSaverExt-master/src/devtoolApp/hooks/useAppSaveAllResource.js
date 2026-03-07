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

// ──────────────────────────────────────────────
// DOM UNBUILDER PIPELINE - Stage 1 & 2
// ──────────────────────────────────────────────

const VOID_ELEMENTS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

class PathRemapper {
  constructor() {
    this._assetCount = 0;
  }

  async run(clone, mainResource) {
    mainResource._downloadedAssets = [];
    
    // Scan for remote URLs in various attributes
    const remoteUrls = this._scanForRemoteUrls(clone);
    
    console.log(`[PathRemapper] Found ${remoteUrls.length} remote URLs to download`);
    
    // Download each asset
    for (const { url, element, attribute } of remoteUrls) {
      try {
        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
          console.warn('[PathRemapper] Extension context invalidated, stopping downloads');
          break;
        }
        
        // Use fetch with no-cors mode for cross-origin resources
        const response = await fetch(url, { 
          mode: 'cors',
          credentials: 'omit'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const content = await this._blobToBase64(blob);
        const ext = this._getExtensionFromUrl(url, blob.type) || 'bin';
        const localPath = `assets/remote/asset_${String(this._assetCount++).padStart(3, '0')}.${ext}`;
        
        mainResource._downloadedAssets.push({
          url,
          localPath,
          content,
          encoding: 'base64'
        });
        
        // FIX 2: FORCE STRICT RELATIVE PATHS IN REMAPPER
        // MISSION 2: Replace URL in clone with strict relative path (add ./ prefix)
        const strictRelativePath = './' + localPath;
        element.setAttribute(attribute, strictRelativePath);
        
        console.log(`[PathRemapper] ✓ Downloaded: ${url} → ${strictRelativePath}`);
      } catch (err) {
        console.warn(`[PathRemapper] ✗ Failed to download ${url}:`, err.message || err);
        // Leave the original URL in place if download fails
        // The resource might still be accessible from the original CDN
      }
    }
    
    console.log(`[PathRemapper] Downloaded ${mainResource._downloadedAssets.length}/${remoteUrls.length} remote assets`);
  }

  _scanForRemoteUrls(clone) {
    const remoteUrls = [];
    const seenUrls = new Set();
    
    // Scan src attributes (img, script, iframe, etc.)
    clone.querySelectorAll('[src]').forEach(el => {
      const url = el.getAttribute('src');
      if (this._isRemoteUrl(url) && !seenUrls.has(url)) {
        seenUrls.add(url);
        remoteUrls.push({ url, element: el, attribute: 'src' });
      }
    });
    
    // Scan href attributes (link, a)
    clone.querySelectorAll('link[href]').forEach(el => {
      const url = el.getAttribute('href');
      // Only download stylesheets and other resources, not navigation links
      if (el.getAttribute('rel') === 'stylesheet' && this._isRemoteUrl(url) && !seenUrls.has(url)) {
        seenUrls.add(url);
        remoteUrls.push({ url, element: el, attribute: 'href' });
      }
    });
    
    // Scan srcset attributes
    clone.querySelectorAll('[srcset]').forEach(el => {
      const srcset = el.getAttribute('srcset');
      if (!srcset) return;
      
      // Parse srcset: "url1 1x, url2 2x" or "url1 100w, url2 200w"
      const urls = srcset.split(',').map(part => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.search(/\s+/);
        return spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx);
      });
      
      urls.forEach(url => {
        if (this._isRemoteUrl(url) && !seenUrls.has(url)) {
          seenUrls.add(url);
          remoteUrls.push({ url, element: el, attribute: 'srcset' });
        }
      });
    });
    
    // Scan CSS background-image in inline styles
    clone.querySelectorAll('[style*="background-image"]').forEach(el => {
      const style = el.getAttribute('style');
      if (!style) return;
      
      const regex = /background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
      let match;
      while ((match = regex.exec(style)) !== null) {
        const url = match[1];
        if (this._isRemoteUrl(url) && !seenUrls.has(url)) {
          seenUrls.add(url);
          remoteUrls.push({ url, element: el, attribute: 'style' });
        }
      }
    });
    
    return remoteUrls;
  }

  _isRemoteUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Filter out data: URIs
    if (url.startsWith('data:')) return false;
    
    // Filter out already-absolute local paths (relative paths like 'assets/...')
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) return false;
    
    // Filter out Google Fonts (protected by data-server-no-download)
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) return false;
    
    // OPTIONAL: Filter out large video files (they might be CORS-protected and huge)
    // Uncomment if you want to skip videos:
    // if (url.match(/\.(mp4|webm|ogg|mov|avi)(\?|$)/i)) return false;
    
    return true;
  }

  async _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  _getExtensionFromUrl(url, contentType = null) {
    // MISSION 3: Strip query params and handle complex CDN URLs
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // Strip query parameters from pathname (for CDN URLs like Storyblok)
      const queryIdx = pathname.indexOf('?');
      if (queryIdx !== -1) {
        pathname = pathname.substring(0, queryIdx);
      }
      
      const lastDot = pathname.lastIndexOf('.');
      const lastSlash = pathname.lastIndexOf('/');
      
      // Extension must come after the last slash
      if (lastDot > lastSlash && lastDot !== -1) {
        let ext = pathname.substring(lastDot + 1).toLowerCase();
        // Clean any remaining query params or fragments
        ext = ext.split('?')[0].split('#')[0];
        if (ext && ext.length <= 5) { // Reasonable extension length
          return ext;
        }
      }
    } catch (e) {
      // Invalid URL, try simple extraction
      let cleanUrl = url.split('?')[0].split('#')[0]; // Strip query params first
      const lastDot = cleanUrl.lastIndexOf('.');
      const lastSlash = cleanUrl.lastIndexOf('/');
      if (lastDot > lastSlash && lastDot !== -1) {
        const ext = cleanUrl.substring(lastDot + 1).toLowerCase();
        if (ext && ext.length <= 5) {
          return ext;
        }
      }
    }
    
    // Fallback to contentType if URL parsing failed
    if (contentType) {
      const typeMap = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'text/css': 'css',
        'text/javascript': 'js',
        'application/javascript': 'js',
        'application/json': 'json',
        'video/mp4': 'mp4',
        'video/webm': 'webm'
      };
      const ext = typeMap[contentType.toLowerCase()];
      if (ext) return ext;
    }
    
    return 'bin';
  }
}

class GSAPBundler {
  async bundle(mainResource) {
    mainResource._gsapFiles = [];
    
    try {
      // Fetch gsap.min.js
      const gsapResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js');
      const gsapContent = await gsapResponse.text();
      mainResource._gsapFiles.push({
        filename: 'js/gsap.min.js',
        content: gsapContent
      });
      
      // Fetch ScrollTrigger.min.js
      const stResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js');
      const stContent = await stResponse.text();
      mainResource._gsapFiles.push({
        filename: 'js/ScrollTrigger.min.js',
        content: stContent
      });
      
      console.log(`[GSAPBundler] Bundled ${mainResource._gsapFiles.length} GSAP files`);
    } catch (err) {
      console.warn('[GSAPBundler] Failed to bundle GSAP files:', err);
      mainResource._gsapFiles = [];
    }
  }
}

class AssetRipper {
  constructor(config = {}) {
    this.svgThreshold = config.svgThreshold || 1024;
    this.b64Threshold = config.b64Threshold || 300;
    this._svgCount = 0;
    this._imgCount = 0;
    this.manifest = { svgs: [], images: [], stats: { svgs: 0, images: 0, charsRemoved: 0 } };
  }

  run(clone) {
    this._buildSpriteMap(clone);
    this._extractInlineSVGs(clone);
    this._extractBase64Src(clone);
    this._extractBase64Backgrounds(clone);
    this._extractBase64Srcset(clone);
    this.manifest.stats.svgs = this.manifest.svgs.length;
    this.manifest.stats.images = this.manifest.images.length;
    return this.manifest;
  }

  _buildSpriteMap(clone) {
    this._spriteMap = new Map();
    clone.querySelectorAll('svg').forEach(svg => {
      const style = svg.getAttribute('style') || '';
      if (style.includes('display: none') || style.includes('display:none') || svg.hasAttribute('hidden')) {
        svg.querySelectorAll('[id]').forEach(el => this._spriteMap.set(el.id, el.cloneNode(true)));
        svg.setAttribute('data-cstudio-sprite-sheet', 'true');
      }
    });
  }

  _extractInlineSVGs(clone) {
    const serializer = new XMLSerializer();
    clone.querySelectorAll('svg').forEach(svg => {
      if (svg.getAttribute('data-cstudio-sprite-sheet') === 'true') { svg.remove(); return; }
      let svgString = serializer.serializeToString(svg);
      if (svgString.length < this.svgThreshold) return;
      this._resolveSpriteRefs(svg, clone);
      this._resolveCurrentColor(svg);
      if (!svg.hasAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgString = serializer.serializeToString(svg);
      const id = `svg_${String(this._svgCount++).padStart(3, '0')}`;
      const filename = `assets/svg/${id}.svg`;
      this.manifest.svgs.push({ id, filename, content: svgString });
      const img = svg.ownerDocument.createElement('img');
      // FIX 2: FORCE STRICT RELATIVE PATHS - Use strict relative path in HTML
      img.setAttribute('src', './assets/svg/' + id + '.svg');
      if (svg.getAttribute('style')) img.setAttribute('style', svg.getAttribute('style'));
      svg.parentNode.replaceChild(img, svg);
    });
  }

  _resolveSpriteRefs(svg, clone) {
    svg.querySelectorAll('use').forEach(use => {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href');
      if (href && href.startsWith('#')) {
        const refId = href.slice(1);
        let symbol = this._spriteMap.get(refId) || clone.querySelector(`#${CSS.escape(refId)}`);
        if (symbol) {
          let defs = svg.querySelector('defs') || svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
          if (!svg.querySelector('defs')) svg.insertBefore(defs, svg.firstChild);
          defs.appendChild(symbol.cloneNode(true));
        }
      }
    });
  }

  _resolveCurrentColor(svg) {
    const resolved = this._getInheritedColor(svg);
    svg.querySelectorAll('[fill="currentColor"]').forEach(el => el.setAttribute('fill', resolved));
    svg.querySelectorAll('[stroke="currentColor"]').forEach(el => el.setAttribute('stroke', resolved));
  }

  _getInheritedColor(element) {
    let current = element.parentElement;
    while (current) {
      const style = current.getAttribute('style');
      if (style) {
        const match = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        if (match && !['inherit', 'initial', 'unset'].includes(match[1].trim())) return match[1].trim();
      }
      current = current.parentElement;
    }
    return '#000000';
  }

  _extractBase64Src(clone) {
    clone.querySelectorAll('[src^="data:"], [poster^="data:"]').forEach(el => {
      const attr = el.hasAttribute('poster') ? 'poster' : 'src';
      const data = el.getAttribute(attr);
      if (data.length < this.b64Threshold) return;
      const id = `img_${String(this._imgCount++).padStart(3, '0')}`;
      const ext = data.split(';')[0].split('/')[1] || 'png';
      const filename = `assets/images/${id}.${ext}`;
      this.manifest.images.push({ id, filename, dataURI: data });
      // FIX 2: FORCE STRICT RELATIVE PATHS - Use strict relative path in HTML
      el.setAttribute(attr, './assets/images/' + id + '.' + ext);
    });
  }

  _extractBase64Backgrounds(clone) {
    clone.querySelectorAll('[style*="data:"]').forEach(el => {
      let style = el.getAttribute('style');
      const regex = /url\(\s*["']?(data:[^"')]*)["']?\s*\)/g;
      let match;
      while ((match = regex.exec(style)) !== null) {
        const data = match[1];
        if (data.length < this.b64Threshold) continue;
        const id = `img_${String(this._imgCount++).padStart(3, '0')}`;
        const filename = `assets/images/${id}.png`;
        this.manifest.images.push({ id, filename, dataURI: data });
        // FIX 2: FORCE STRICT RELATIVE PATHS - Use strict relative path in HTML
        style = style.replace(data, './assets/images/' + id + '.png');
      }
      el.setAttribute('style', style);
    });
  }

  _extractBase64Srcset(clone) {} // Placeholder

  // ──────────────────────────────────────────────
  // Stage 3: Structural Unwrapping (Melting Div-ception)
  // ──────────────────────────────────────────────
  unwrapMeaninglessDivs(clone) {
    let unwrappedCount = 0;
    
    // Process bottom-up: get all elements and reverse
    const allElements = Array.from(clone.querySelectorAll('*')).reverse();
    
    allElements.forEach(el => {
      // Only process divs and spans
      if (el.tagName !== 'DIV' && el.tagName !== 'SPAN') return;
      
      // Skip if element has semantic meaning
      if (this._hasSemanticMeaning(el)) return;
      
      // Skip if element has visual styles
      if (this._hasVisualStyles(el)) return;
      
      // Element is meaningless - unwrap it
      if (this._canUnwrap(el)) {
        this._unwrapElement(el);
        unwrappedCount++;
      }
    });
    
    // Clean framework roots
    this._cleanFrameworkRoots(clone);
    
    console.log(`[DEVTOOL] Stage 3: Unwrapped ${unwrappedCount} meaningless divs`);
    return unwrappedCount;
  }

  _hasSemanticMeaning(el) {
    // Has ID, role, or ARIA attributes
    if (el.hasAttribute('id')) return true;
    if (el.hasAttribute('role')) return true;
    
    // CRITICAL HOTFIX: Protect elements that rely on CSS classes for layout
    // Without Stage 0 (Class Fossilization), we must preserve ALL class-based styling
    if (el.hasAttribute('class') && el.getAttribute('class').trim() !== '') return true;
    
    // CRITICAL: Protect CStudio animation markers from unwrapper
    const classList = el.className;
    if (typeof classList === 'string' && classList.includes('cstudio-animate-me')) return true;
    
    for (let attr of el.attributes) {
      if (attr.name.startsWith('aria-')) return true;
      if (attr.name.startsWith('data-cstudio-')) return true; // Preserve our markers
    }
    
    return false;
  }

  _hasVisualStyles(el) {
    const style = el.getAttribute('style') || '';
    const computedStyle = style.toLowerCase();
    
    // Check for layout-defining display modes
    if (computedStyle.includes('display: flex') || 
        computedStyle.includes('display:flex') ||
        computedStyle.includes('display: grid') ||
        computedStyle.includes('display:grid') ||
        computedStyle.includes('display: table') ||
        computedStyle.includes('display:table')) {
      return true;
    }
    
    // Check for positioning
    if (computedStyle.includes('position: absolute') ||
        computedStyle.includes('position:absolute') ||
        computedStyle.includes('position: fixed') ||
        computedStyle.includes('position:fixed') ||
        computedStyle.includes('position: relative') ||
        computedStyle.includes('position:relative') ||
        computedStyle.includes('position: sticky') ||
        computedStyle.includes('position:sticky')) {
      return true;
    }
    
    // Check for visual properties
    if (computedStyle.includes('background') && 
        !computedStyle.includes('background: none') &&
        !computedStyle.includes('background:none') &&
        !computedStyle.includes('background: transparent') &&
        !computedStyle.includes('background:transparent')) {
      return true;
    }
    
    if (computedStyle.includes('border') && 
        !computedStyle.includes('border: none') &&
        !computedStyle.includes('border:none') &&
        !computedStyle.includes('border: 0') &&
        !computedStyle.includes('border:0')) {
      return true;
    }
    
    if (computedStyle.includes('box-shadow')) return true;
    if (computedStyle.includes('text-shadow')) return true;
    
    // Check for opacity
    const opacityMatch = computedStyle.match(/opacity\s*:\s*([\d.]+)/);
    if (opacityMatch && parseFloat(opacityMatch[1]) < 1) return true;
    
    // Check for transform (might be animated)
    if (computedStyle.includes('transform') && 
        !computedStyle.includes('transform: none') &&
        !computedStyle.includes('transform:none')) {
      return true;
    }
    
    // Check for padding/margin (spacing matters)
    // Allow unwrapping if only one child - we can transfer spacing
    if (el.children.length > 1) {
      if (computedStyle.includes('padding') && 
          !computedStyle.includes('padding: 0') &&
          !computedStyle.includes('padding:0')) {
        return true;
      }
      if (computedStyle.includes('margin') && 
          !computedStyle.includes('margin: 0') &&
          !computedStyle.includes('margin:0') &&
          !computedStyle.includes('margin: auto') &&
          !computedStyle.includes('margin:auto')) {
        return true;
      }
    }
    
    // Check for width/height constraints
    if (computedStyle.includes('width') || 
        computedStyle.includes('height') ||
        computedStyle.includes('max-width') ||
        computedStyle.includes('max-height') ||
        computedStyle.includes('min-width') ||
        computedStyle.includes('min-height')) {
      return true;
    }
    
    // Check for overflow
    if (computedStyle.includes('overflow') && 
        !computedStyle.includes('overflow: visible') &&
        !computedStyle.includes('overflow:visible')) {
      return true;
    }
    
    // Check for z-index
    if (computedStyle.includes('z-index')) return true;
    
    return false;
  }

  _canUnwrap(el) {
    // Must have a parent to unwrap into
    if (!el.parentNode) return false;
    
    // Don't unwrap body or html
    if (el.tagName === 'BODY' || el.tagName === 'HTML') return false;
    
    // Must have at least one child (text or element)
    if (el.childNodes.length === 0) return false;
    
    return true;
  }

  _unwrapElement(el) {
    const parent = el.parentNode;
    
    // If element has spacing and exactly one child, transfer spacing to child
    if (el.children.length === 1 && el.hasAttribute('style')) {
      const style = el.getAttribute('style');
      const child = el.children[0];
      
      // Transfer padding/margin to child
      const paddingMatch = style.match(/padding[^;]*/gi);
      const marginMatch = style.match(/margin[^;]*/gi);
      
      if (paddingMatch || marginMatch) {
        const childStyle = child.getAttribute('style') || '';
        let newStyle = childStyle;
        
        if (paddingMatch) {
          paddingMatch.forEach(p => {
            if (!childStyle.includes('padding')) {
              newStyle += '; ' + p;
            }
          });
        }
        
        if (marginMatch) {
          marginMatch.forEach(m => {
            if (!childStyle.includes('margin')) {
              newStyle += '; ' + m;
            }
          });
        }
        
        if (newStyle !== childStyle) {
          child.setAttribute('style', newStyle.trim());
        }
      }
    }
    
    // Move all children to parent before this element
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    
    // Remove the now-empty wrapper
    parent.removeChild(el);
  }

  _cleanFrameworkRoots(clone) {
    // Force unwrap framework containers if they're just wrappers
    const frameworkIds = ['root', '__next', '__nuxt', 'app', '__app'];
    
    frameworkIds.forEach(id => {
      const el = clone.querySelector(`#${id}`);
      if (!el) return;
      
      // Only unwrap if it's a div/span with no visual styles
      if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && 
          !this._hasVisualStyles(el) && 
          this._canUnwrap(el)) {
        console.log(`[DEVTOOL] Stage 3: Removing framework root #${id}`);
        this._unwrapElement(el);
      }
    });
  }

  // ──────────────────────────────────────────────
  // Stage 4: DOM URL Normalization
  // ──────────────────────────────────────────────
  normalizePathsToAbsolute(clone) {
    const doc = clone.ownerDocument || document;
    const base = doc.baseURI || window.location.href;
    
    console.log('[DEVTOOL] Stage 4: Normalizing relative URLs to absolute for CStudio URL replacer...');
    let normalizedCount = 0;
    
    // Normalize hrefs and srcs
    clone.querySelectorAll('[src], [href]').forEach(el => {
      if (el.hasAttribute('src') && !el.getAttribute('src').startsWith('data:')) {
        try {
          const absoluteUrl = new URL(el.getAttribute('src'), base).href;
          el.setAttribute('src', absoluteUrl);
          normalizedCount++;
        } catch (e) {
          // Invalid URL, skip
        }
      }
      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('data:') && !el.getAttribute('href').startsWith('#')) {
        try {
          const absoluteUrl = new URL(el.getAttribute('href'), base).href;
          el.setAttribute('href', absoluteUrl);
          normalizedCount++;
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    // Normalize inline CSS background-image urls
    clone.querySelectorAll('[style*="url("]').forEach(el => {
      let style = el.getAttribute('style');
      style = style.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, url) => {
        if (url.startsWith('data:')) return match;
        try {
          return `url("${new URL(url, base).href}")`;
        } catch (e) {
          return match;
        }
      });
      el.setAttribute('style', style);
    });
    
    console.log(`[DEVTOOL] Stage 4: Normalized ${normalizedCount} URLs to absolute paths`);
  }
}

class HTMLBeautifier {
  constructor(config = {}) {
    this.tab = config.indent || '  ';
  }

  beautify(root) {
    return '<!DOCTYPE html>\n' + this._serialize(root, 0);
  }

  _serialize(node, depth) {
    if (node.nodeType === 3) return this.tab.repeat(depth) + node.textContent.trim() + '\n';
    if (node.nodeType === 8) return this.tab.repeat(depth) + '<!--' + node.textContent + '-->\n';
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const pad = this.tab.repeat(depth);
    let attrs = Array.from(node.attributes).map(a => ` ${a.name}="${a.value}"`).join('');
    let res = `${pad}<${tag}${attrs}>`;
    if (VOID_ELEMENTS.has(tag)) return res + '\n';
    res += '\n';
    node.childNodes.forEach(child => { res += this._serialize(child, depth + 1); });
    return res + `${pad}</${tag}>\n`;
  }
}

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
    // ──────────────────────────────────────────────
    // KEEP-ALIVE: Prevent Extension Context Invalidation
    // ──────────────────────────────────────────────
    // Notify background service worker that a heavy operation is starting.
    // This prevents Manifest V3 from terminating the worker during long operations
    // (e.g., downloading many remote assets in PathRemapper).
    try {
      await chrome.runtime.sendMessage({ type: 'CSTUDIO_KEEP_ALIVE_START' });
      console.log('[CStudio] Keep-alive activated for save operation');
    } catch (err) {
      console.warn('[CStudio] Failed to activate keep-alive:', err);
      // Continue anyway - the operation might still succeed
    }
    
    try {
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
                    
                    // FIX 3: CLEAN UP VISBUG UI IN STAGE 2
                    const visbugElements = clone.querySelectorAll('vis-bug, .visbug, [id^="visbug"], [class*="visbug"]');
                    visbugElements.forEach(el => el.remove());
                    console.log('[DEVTOOL] Stage 2: Removed ' + visbugElements.length + ' VisBug UI elements');

                    // CRITICAL HOTFIX: Protect Google Fonts from being downloaded as broken local resources
                    clone.querySelectorAll('link[href*="fonts.googleapis"]').forEach(el => {
                      el.setAttribute('data-server-no-download', 'true');
                    });

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

                    // FIXED: SMART URL ABSOLUTIZATION FOR LINKS AND ANCHORS
                    clone.querySelectorAll('link[href], a[href]').forEach(el => {
                      if (el.hasAttribute('href')) {
                        const originalHref = el.getAttribute('href').trim();
                        if (!originalHref.startsWith('#') && !originalHref.startsWith('data:') && !originalHref.startsWith('http') && !originalHref.startsWith('//')) {
                          try { 
                            el.href = new URL(originalHref, liveBase).href; 
                          } catch(e) {}
                        }
                      }
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

                    // ──────────────────────────────────────────────
                    // GHOST LOCK: CSP-Based Framework Paralysis
                    // ──────────────────────────────────────────────
                    // Generate a cryptographic nonce for our scripts
                    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
                    
                    // Install the Ghost Lock (CSP) at the very top of <head>
                    const head = clone.querySelector('head');
                    if (head) {
                      const csp = clone.ownerDocument.createElement('meta');
                      csp.setAttribute('http-equiv', 'Content-Security-Policy');
                      csp.setAttribute('content', 
                        \`script-src 'nonce-\${nonce}' 'unsafe-inline'; \` +
                        \`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; \` +
                        \`img-src * 'self' data: blob:; \` +
                        \`font-src * 'self' data:; \` +
                        \`connect-src 'self' ws://localhost:* http://localhost:*; \` +
                        \`media-src * 'self' data: blob:; \` +
                        \`frame-src 'none'\`
                      );
                      head.insertBefore(csp, head.firstChild);
                      console.log('[DEVTOOL] Ghost Lock (CSP) installed with nonce:', nonce);
                    }

                    // 7. INJECT PHANTOM ENGINE & DIAGNOSTIC REPORT (with nonce)
                    if (body) {
                      const engineScript = document.createElement('script');
                      engineScript.setAttribute('nonce', nonce);
                      engineScript.setAttribute('class', 'cstudio-phantom-script');
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

                        const s1 = document.createElement('script'); 
                        s1.src = './js/gsap.min.js'; 
                        s1.setAttribute('nonce', '\${nonce}');
                        document.body.appendChild(s1);
                        
                        const s2 = document.createElement('script'); 
                        s2.src = './js/ScrollTrigger.min.js'; 
                        s2.setAttribute('nonce', '\${nonce}');
                        document.body.appendChild(s2);
                        
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
                          console.log("- CSP Active: Only scripts with nonce='\${nonce}' can execute.");
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
              // ──────────────────────────────────────────────
              // DOM UNBUILDER PIPELINE: Asset Ripper + Structural Unwrapping + HTML Beautifier
              // ──────────────────────────────────────────────
              dispatch(uiActions.setStatus('Running DOM Unbuilder Pipeline...'));
              
              // Parse the captured DOM string back into a document
              const parser = new DOMParser();
              const doc = parser.parseFromString(capturedDOM, 'text/html');
              const clone = doc.documentElement;

              // Stage 0: PathRemapper - Download remote assets
              console.log('[DEVTOOL] Stage 0: PathRemapper - Downloading remote assets...');
              const pathRemapper = new PathRemapper();
              await pathRemapper.run(clone, mainResource);
              console.log('[DEVTOOL] PathRemapper Complete:', mainResource._downloadedAssets?.length || 0, 'assets downloaded');

              // Stage 1: Asset Ripper - Extract SVGs and Base64 images
              console.log('[DEVTOOL] Stage 1: Asset Ripper - Extracting inline assets...');
              const ripper = new AssetRipper();
              const assetManifest = ripper.run(clone);
              console.log('[DEVTOOL] Asset Ripper Complete:', assetManifest.stats);

              // Stage 3: Structural Unwrapping - Melt meaningless div-ception
              console.log('[DEVTOOL] Stage 3: Structural Unwrapping - Melting div-ception...');
              const unwrappedCount = ripper.unwrapMeaninglessDivs(clone);
              console.log(`[DEVTOOL] Structural Unwrapping Complete: ${unwrappedCount} wrappers removed`);

              // NUCLEAR OVERRIDE: Stage 4 DISABLED - PathRemapper already set strict relative paths
              // Stage 4 was converting our ./js/gsap.min.js back to http://localhost:3000/js/gsap.min.js
              // which then got mangled by legacy patchContent. We don't need it anymore.
              // ripper.normalizePathsToAbsolute(clone); // DISABLED

              // Stage 5: HTML Beautifier - Generate clean, formatted HTML
              console.log('[DEVTOOL] Stage 5: HTML Beautifier - Formatting output...');
              const beautifier = new HTMLBeautifier();
              let finalHTML = beautifier.beautify(clone);

              // Ensure DOCTYPE is present
              if (!finalHTML.trim().toLowerCase().startsWith('<!doctype')) {
                finalHTML = '<!DOCTYPE html>\n' + finalHTML;
              }
              
              // FIX 4: CLEAN UP ANY REMAINING :3000 GHOSTS
              // Just to be absolutely safe, run one final regex on the entire HTML string BEFORE beautification
              finalHTML = finalHTML.replace(/:[0-9]{4}\/assets/g, './assets');
              finalHTML = finalHTML.replace(/:[0-9]{4}\/js/g, './js');
              console.log('[DEVTOOL] Stage 5: Cleaned up port number ghosts from final HTML');

              console.log('[DEVTOOL] Overwriting main page content with Live DOM Snapshot');
              if (isV3Mode) {
                console.log('[DEVTOOL] V3.0 Mode: Phantom Engine injected with Ghost Lock (CSP) - Framework paralyzed, GSAP whitelisted');
              }
              
              // Store the asset manifest for ZIP creation
              mainResource.content = finalHTML;
              mainResource._assetManifest = assetManifest;
              // NUCLEAR OVERRIDE: Skip legacy patchContent for main HTML - we've already fixed all paths in DOM
              mainResource._skipPatchContent = true;

              // Stage 6: GSAP Bundler - Fetch GSAP libraries for offline use
              console.log('[DEVTOOL] Stage 6: GSAP Bundler - Fetching GSAP libraries...');
              const gsapBundler = new GSAPBundler();
              await gsapBundler.bundle(mainResource);
              console.log('[DEVTOOL] GSAP Bundler Complete');
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
    } finally {
      // ──────────────────────────────────────────────
      // KEEP-ALIVE: Stop keep-alive after operation completes
      // ──────────────────────────────────────────────
      // Always stop keep-alive, even if operation failed
      try {
        await chrome.runtime.sendMessage({ type: 'CSTUDIO_KEEP_ALIVE_STOP' });
        console.log('[CStudio] Keep-alive deactivated after save operation');
      } catch (err) {
        console.warn('[CStudio] Failed to deactivate keep-alive:', err);
        // Not critical - the worker will naturally sleep after 30s
      }
    }
  }, [state, dispatch, tab]);

  useEffect(() => {
    networkResourceRef.current = networkResource;
  }, [networkResource]);

  useEffect(() => {
    staticResourceRef.current = staticResource;
  }, [staticResource]);

  return { handleOnSave };
};
