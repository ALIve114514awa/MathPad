const assert = require('node:assert/strict');
const test = require('node:test');
const { createGeoGebraAssets } = require('../src/geogebra-assets.cjs');
const manifest = require('../vendor/geogebra/manifest.json');

test('local GeoGebra routes serve only manifest files with matching script, CSS and image MIME types', () => {
  const asset = createGeoGebraAssets();
  assert.match(asset('/geogebra/deployggb.js').contentType, /^text\/javascript/);
  const font = manifest.files.find((file) => file.path.includes('/fonts/') && file.path.endsWith('.js'));
  assert.ok(font);
  assert.equal(asset(`/geogebra/${font.path}`).contentType, 'text/javascript; charset=utf-8');
  assert.equal(asset('/geogebra/HTML5/5.0/web3d/clear.cache.gif').contentType, 'image/gif');
  assert.equal(asset('/geogebra/HTML5/5.0/css/bundles/bundle.css').contentType, 'text/css; charset=utf-8');
  for (const pathname of [
    '/geogebra/../package.json', '/geogebra/%2e%2e/package.json',
    '/geogebra/HTML5/%2e%2e/deployggb.js', '/geogebra/..%5cpackage.json',
    '/geogebra/%', '/geogebra/missing.js', '/package.json',
  ]) assert.equal(asset(pathname), undefined, pathname);
});
