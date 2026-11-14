const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifest = JSON.parse(readFileSync(path.join(root, 'portable-manifest.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const file of manifest.files) {
  const name = path.resolve(root, file.path);
  assert.ok(name.startsWith(`${root}${path.sep}`), 'Manifest path must stay inside the portable folder');
  const bytes = readFileSync(name);
  assert.equal(bytes.length, file.size, `${file.path} size mismatch`);
  assert.equal(hash(bytes), file.sha256, `${file.path} checksum mismatch`);
  assert.ok(bytes.length < 100 * 1024 * 1024, `${file.path} exceeds the regular GitHub file size limit`);
}
const engine = JSON.parse(readFileSync(path.join(root, 'runtime', 'engine.json'), 'utf8'));
const digest = createHash('sha256');
let size = 0;
for (const chunk of engine.chunks) {
  const bytes = inflateRawSync(readFileSync(path.join(root, 'runtime', chunk)));
  digest.update(bytes); size += bytes.length;
}
assert.equal(size, engine.size, 'Restored engine size mismatch');
assert.equal(digest.digest('hex'), engine.sha256, 'Restored engine checksum mismatch');
console.log(`Verified ${manifest.version}: ${manifest.files.length} portable files; complete engine; root MathPad.exe.`);
