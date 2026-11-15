const { readFileSync } = require('node:fs');
const path = require('node:path');

const types = {
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ggb': 'application/vnd.geogebra.file',
};

function createGeoGebraAssets(root = path.join(__dirname, '..', 'vendor', 'geogebra')) {
  let paths = new Set();
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    paths = new Set(manifest.files.map((file) => file.path));
  } catch (error) {
    console.warn('Local GeoGebra manifest unavailable:', error.message);
  }
  return (pathname) => {
    if (!pathname.startsWith('/geogebra/')) return undefined;
    let relative;
    try { relative = decodeURIComponent(pathname.slice('/geogebra/'.length)); }
    catch { return undefined; }
    if (relative.split('/').some((part) => part === '..' || part === '.') || relative.includes('\\')) return undefined;
    if (!paths.has(relative)) return undefined;
    return {
      filename: path.join(root, relative),
      contentType: types[path.extname(relative).toLowerCase()] || 'application/octet-stream',
    };
  };
}

module.exports = { createGeoGebraAssets };
