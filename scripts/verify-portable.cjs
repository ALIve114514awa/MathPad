const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { lstatSync, readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');

function verifyPortable(root = path.resolve(__dirname, '..'), { quiet = false } = {}) {
  root = path.resolve(root);
  const manifest = JSON.parse(readFileSync(path.join(root, 'portable-manifest.json'), 'utf8'));
  const runtimeDirectory = manifest.runtimeDirectory;
  assert.equal(manifest.platform, 'win32-x64', 'Only the Windows x64 runtime is supplied');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'Invalid portable version');
  assert.match(runtimeDirectory, /^runtime(?:-[a-zA-Z0-9._-]+)?$/, 'Invalid portable runtime directory');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'Missing portable file list');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const recorded = new Set();
  for (const file of manifest.files) {
    assert.ok(typeof file.path === 'string' && !file.path.includes('\\') && !file.path.split('/').some(part => ['.', '..', ''].includes(part)), 'Invalid manifest path');
    assert.ok(file.path === 'MathPad.exe' || file.path.startsWith(`${runtimeDirectory}/`), 'Manifest contains a file outside the runtime');
    const key = file.path.toLowerCase();
    assert.ok(!recorded.has(key), `Duplicate portable file: ${file.path}`);
    recorded.add(key);
    const name = path.resolve(root, file.path);
    assert.ok(name.startsWith(`${root}${path.sep}`), 'Manifest path must stay inside the portable folder');
    assert.ok(lstatSync(name).isFile(), `${file.path} must be a regular file`);
    const bytes = readFileSync(name);
    assert.equal(bytes.length, file.size, `${file.path} size mismatch`);
    assert.equal(hash(bytes), file.sha256, `${file.path} checksum mismatch`);
    assert.ok(bytes.length < 100 * 1024 * 1024, `${file.path} exceeds the regular GitHub file size limit`);
  }
  for (const required of [
    'MathPad.exe', `${runtimeDirectory}/engine.json`, `${runtimeDirectory}/resources/app.asar`,
    `${runtimeDirectory}/icudtl.dat`, `${runtimeDirectory}/resources.pak`, `${runtimeDirectory}/locales/en-US.pak`,
    `${runtimeDirectory}/LICENSE`, `${runtimeDirectory}/LICENSES.chromium.html`,
    `${runtimeDirectory}/resources/THIRD_PARTY_NOTICES.md`,
    ...['Nerdamer-LICENSE.txt', 'Nerdamer-bundle-NOTICE.txt', 'decimal.js-LICENSE.txt', 'KaTeX-LICENSE.txt', 'Commander-LICENSE.txt', 'GeoGebra-LICENSE.txt', 'GeoGebra-NOTICE.md', 'README.md']
      .map(name => `${runtimeDirectory}/resources/licenses/${name}`),
  ]) assert.ok(recorded.has(required.toLowerCase()), `Missing portable manifest entry: ${required}`);
  function checkDirectory(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      assert.ok(!entry.isSymbolicLink(), `Runtime symlinks are not portable: ${name}`);
      if (entry.isDirectory()) checkDirectory(name);
      else if (!['MathPadHost.exe', '.engine-ready'].includes(entry.name) && !/^MathPadHost\.exe\.\d+\.tmp$/.test(entry.name)) {
        assert.ok(recorded.has(name.toLowerCase()), `Unrecorded runtime file: ${name}`);
      }
    }
  }
  checkDirectory(runtimeDirectory);
  const engine = JSON.parse(readFileSync(path.join(root, runtimeDirectory, 'engine.json'), 'utf8'));
  assert.ok(Array.isArray(engine.chunks) && engine.chunks.length > 0, 'Missing engine chunks');
  assert.equal(new Set(engine.chunks).size, engine.chunks.length, 'Duplicate engine chunks');
  assert.ok(Number.isSafeInteger(engine.size) && engine.size > 0, 'Invalid engine size');
  assert.match(engine.sha256, /^[a-f0-9]{64}$/, 'Invalid engine checksum');
  const digest = createHash('sha256');
  let size = 0;
  for (const chunk of engine.chunks) {
    assert.match(chunk, /^engine-\d+\.deflate$/, 'Invalid engine chunk path');
    assert.ok(recorded.has(`${runtimeDirectory}/${chunk}`.toLowerCase()), `Unrecorded engine chunk: ${chunk}`);
    const bytes = inflateRawSync(readFileSync(path.join(root, runtimeDirectory, chunk)));
    digest.update(bytes); size += bytes.length;
  }
  assert.equal(size, engine.size, 'Restored engine size mismatch');
  assert.equal(digest.digest('hex'), engine.sha256, 'Restored engine checksum mismatch');
  if (!quiet) console.log(`Verified ${manifest.version}: ${manifest.files.length} portable files; complete engine, licenses and root MathPad.exe.`);
  return manifest;
}
module.exports = { verifyPortable };
if (require.main === module) verifyPortable(process.argv[2] || path.resolve(__dirname, '..'));
