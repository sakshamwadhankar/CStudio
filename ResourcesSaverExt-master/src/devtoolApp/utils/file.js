import prettier from 'prettier';
import htmlParser from 'prettier/parser-html';
import babelParser from 'prettier/parser-babel';
import postCssParser from 'prettier/parser-postcss';
import * as zip from '@zip.js/zip.js';

// ──────────────────────────────────────────────
// Smart Patcher: Path Resolution & Content Patching
// ──────────────────────────────────────────────

/**
 * Calculate the relative path from one file to another inside the ZIP.
 * Pure string math – no Node `path` module needed.
 */
export const getRelativePath = (fromPath, toPath) => {
  // Normalise separators and strip leading slashes
  const norm = (p) => p.replace(/\\/g, '/').replace(/^\/+/, '');
  const fromParts = norm(fromPath).split('/');
  const toParts = norm(toPath).split('/');

  // Drop the filename segment from `from` – we want its directory
  fromParts.pop();

  // Find the length of the common prefix
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  // Walk up from fromDir, then down into toPath
  const ups = fromParts.length - common;
  const remainder = toParts.slice(common);
  const rel = [...Array(ups).fill('..'), ...remainder].join('/');

  return rel || toParts[toParts.length - 1]; // fallback: same directory
};

/**
 * Replace every absolute URL found in `content` with its local relative path.
 * Only replaces URLs that actually exist in `resourceMap`.
 */
export const patchContent = (content, currentFilePath, resourceMap) => {
  if (!content || typeof content !== 'string') return content;

  let patched = content;

  for (const [originalUrl, localPath] of resourceMap.entries()) {
    // Never rewrite data URIs
    if (originalUrl.startsWith('data:')) continue;
    // Don't replace a file's reference to itself
    if (localPath === currentFilePath) continue;

    // Only do work if the URL actually appears in the content
    if (!patched.includes(originalUrl)) continue;

    const relativePath = getRelativePath(currentFilePath, localPath);

    // Escape special regex chars in the URL so we can do a global replace
    const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patched = patched.replace(new RegExp(escaped, 'g'), relativePath);
  }

  return patched;
};

/**
 * Build a Map<originalUrl, saveAs.path> from the full list of items.
 */
export const buildResourceMap = (items) => {
  const map = new Map();
  for (const item of items) {
    if (item.url && item.saveAs?.path) {
      map.set(item.url, item.saveAs.path);
    }
  }
  return map;
};

// ──────────────────────────────────────────────
// Original helpers
// ──────────────────────────────────────────────

export const resolveDuplicatedResources = (resourceList = []) => {
  const resolvedListByKey = {};
  const result = [];
  const resourceListUniqByUrl = Object.values(
    resourceList.reduce(
      (list, res) => ({
        ...list,
        ...(!list[res.url] || !list[res.url].content || res.content
          ? {
            [res.url]: res,
          }
          : {}),
      }),
      {}
    )
  );
  resourceListUniqByUrl
    .filter((r) => r && r.saveAs && r.saveAs.path && r.saveAs.name)
    .sort((rA, rB) => rA.saveAs.path.localeCompare(rB.saveAs.path))
    .forEach((r) => {
      resolvedListByKey[r.saveAs.path] = (resolvedListByKey[r.saveAs.path] || []).concat([r]);
    });
  Object.values(resolvedListByKey).forEach((rGroup) => {
    result.push(
      ...(rGroup.length < 2
        ? rGroup
        : rGroup.map((r, rIndex) =>
          rIndex === 0
            ? r
            : {
              ...r,
              saveAs: {
                ...r.saveAs,
                name: r.saveAs.name.replace(/(\.)(?!.*\.)/g, ` (${rIndex}).`),
                path: r.saveAs.path.replace(/(\.)(?!.*\.)/g, ` (${rIndex}).`),
              },
            }
        ))
    );
  });
  return result;
};

export const downloadZipFile = (toDownload, options, eachDoneCallback, callback) => {
  // ── Smart Patcher: build resource map once ──
  const resourceMap = buildResourceMap(toDownload);

  // ── DOM Unbuilder: Extract asset manifests and inject assets into download list ──
  const assetsToAdd = [];
  toDownload.forEach(item => {
    if (item._assetManifest) {
      const manifest = item._assetManifest;
      
      // Add extracted SVGs
      manifest.svgs.forEach(svg => {
        assetsToAdd.push({
          url: svg.filename,
          content: svg.content,
          saveAs: {
            name: svg.filename.split('/').pop(),
            path: svg.filename
          }
        });
      });

      // Add extracted images (decode base64 data URIs)
      manifest.images.forEach(img => {
        assetsToAdd.push({
          url: img.filename,
          content: img.dataURI,
          encoding: 'base64',
          saveAs: {
            name: img.filename.split('/').pop(),
            path: img.filename
          }
        });
      });

      console.log(`[DEVTOOL] DOM Unbuilder: Added ${manifest.svgs.length} SVGs and ${manifest.images.length} images to ZIP`);
      delete item._assetManifest; // Clean up
    }
  });

  // Merge assets into the download list
  const finalDownloadList = [...toDownload, ...assetsToAdd];

  const blobWrite = new zip.BlobWriter('application/zip');
  const zipWriter = new zip.ZipWriter(blobWrite);
  addItemsToZipWriter(
    zipWriter,
    finalDownloadList,
    options,
    resourceMap,
    eachDoneCallback,
    downloadCompleteZip.bind(this, zipWriter, blobWrite, callback)
  );
};

// Create a reader of the content for zip
export const getContentRead = (item) => {
  if (item.encoding === 'base64') {
    return new zip.Data64URIReader(item.content || 'No Content: ' + item.url);
  }
  if (item.content instanceof Blob) {
    return new zip.BlobReader(item.content);
  }
  return new zip.TextReader(item.content || 'No Content: ' + item.url);
};

/**
 * Helper: determines if an item is a patchable text file (HTML, CSS, JS).
 */
const isPatchableFile = (item) => {
  if (item.encoding === 'base64' || item.content instanceof Blob) return false;
  if (typeof item.content !== 'string') return false;
  const ext = item.saveAs?.name?.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
  if (!ext) return false;
  return ['html', 'css', 'js', 'htm', 'svg', 'xhtml'].includes(ext[1].toLowerCase());
};

export const addItemsToZipWriter = (zipWriter, items, options, resourceMap, eachDoneCallback, callback) => {
  const item = items[0];
  const rest = items.slice(1);

  // if item exist so add it to zip
  if (item) {
    // ── Smart Patcher: rewrite absolute URLs to relative paths ──
    if (isPatchableFile(item) && resourceMap && resourceMap.size > 0) {
      try {
        item.content = patchContent(item.content, item.saveAs.path, resourceMap);
      } catch (err) {
        console.log('[DEVTOOL]', 'Cannot patch file', item.saveAs?.path, err);
      }
    }

    // Beautify here
    if (options?.beautifyFile && !item.encoding && !!item.content) {
      try {
        const fileExt = item.saveAs?.name?.match(/\.([0-9a-z]+)(?:[\?#]|$)/);
        switch (fileExt ? fileExt[1] : '') {
          case 'js': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'babel', plugins: [babelParser] });
            break;
          }
          case 'json': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'json', plugins: [babelParser] });
            break;
          }
          case 'html': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'html', plugins: [htmlParser, babelParser, postCssParser] });
            break;
          }
          case 'css': {
            console.log('[DEVTOOL]', item.saveAs?.name, ' will be beautified!');
            item.content = prettier.format(item.content, { parser: 'css', plugins: [postCssParser] });
            break;
          }
        }
      } catch (err) {
        console.log('[DEVTOOL]', 'Cannot format file', item, err);
      }
    }

    // Check whether base64 encoding is valid
    if (item.encoding === 'base64') {
      // Try to decode first
      try {
        atob(item.content);
      } catch (err) {
        console.log('[DEVTOOL]', item.url, ' is not base64 encoding, try to encode to base64.');
        try {
          item.content = btoa(item.content);
        } catch (err) {
          console.log('[DEVTOOL]', item.url, ' failed to encode to base64, fallback to text.');
          item.encoding = null;
        }
      }
    }

    // Create a reader of the content for zip
    const resolvedContent = getContentRead(item);

    // Item has no content
    const isNoContent = !item.content;
    const ignoreNoContentFile = !!options?.ignoreNoContentFile;
    if (isNoContent && ignoreNoContentFile) {
      // Exclude file as no content
      console.log('[DEVTOOL]', 'EXCLUDED: ', item.url);
      eachDoneCallback(item, true);
      addItemsToZipWriter(zipWriter, rest, options, resourceMap, eachDoneCallback, callback);
    } else {
      // Make sure the file has some byte otherwise no import to avoid corrupted zip
      if (resolvedContent.size > 0 || resolvedContent['blobReader']?.size > 0) {
        zipWriter.add(item.saveAs.path, resolvedContent).finally(() => {
          eachDoneCallback(item, true);
          addItemsToZipWriter(zipWriter, rest, options, resourceMap, eachDoneCallback, callback);
        });
      } else {
        // If no size, exclude the item
        console.log('[DEVTOOL]', 'EXCLUDED: ', item.url);
        eachDoneCallback(item, false);
        addItemsToZipWriter(zipWriter, rest, options, resourceMap, eachDoneCallback, callback);
      }
    }
  } else {
    // Callback when all done
    callback();
  }
  return rest;
};

export const downloadCompleteZip = (zipWriter, blobWriter, callback) => {
  zipWriter.close();
  blobWriter.getData().then((blob) => {
    chrome.tabs.get(chrome.devtools.inspectedWindow.tabId, function (tab) {
      let url = new URL(tab.url);
      let filename = url.hostname ? url.hostname.replace(/([^A-Za-z0-9.])/g, '_') : 'all';
      let a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename + '.zip';
      a.click();
      callback();
    });
  });
};
