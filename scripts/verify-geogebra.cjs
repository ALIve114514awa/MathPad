const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function verifyGeoGebra(root = path.join(__dirname, '..', 'vendor', 'geogebra')) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const names = new Set();
  for (const file of manifest.files) {
    assert.ok(!file.path.includes('\\') && !file.path.split('/').some((part) => ['.', '..', ''].includes(part)), 'Invalid GeoGebra asset path');
    assert.ok(!names.has(file.path), `Duplicate GeoGebra file: ${file.path}`);
    names.add(file.path);
    const bytes = readFileSync(path.join(root, file.path));
    assert.equal(bytes.length, file.size, `${file.path}: size mismatch`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path}: checksum mismatch`);
  }
  for (const file of ['deployggb.js', 'HTML5/5.0/web3d/web3d.nocache.js', 'HTML5/5.0/css/bundles/bundle.css', 'UPSTREAM-README.txt']) {
    assert.ok(names.has(file), `Missing GeoGebra runtime: ${file}`);
  }
  assert.ok(manifest.files.some((file) => file.path.startsWith('HTML5/5.0/web3d/deferredjs/')), 'Missing GeoGebra deferred modules');
  assert.ok(manifest.source.startsWith('https://download.geogebra.org/'), 'Official GeoGebra source required');
  console.log(`Verified GeoGebra ${manifest.version}: ${manifest.files.length} local assets.`);
}

module.exports = { verifyGeoGebra };
if (require.main === module) verifyGeoGebra();
