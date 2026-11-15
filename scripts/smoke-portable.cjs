// Verify the exact shipped files in a fresh Unicode/space-containing directory.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPortable } = require('./verify-portable.cjs');
const root = path.resolve(__dirname, '..');
const manifest = verifyPortable(root);
const output = path.join(root, 'out');
fs.mkdirSync(output, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(output, 'portable-test-'));
const copied = path.join(sandbox, '数学面板 全新副本');
const report = path.join(os.tmpdir(), 'MathPad-portable-smoke.log');
fs.mkdirSync(copied);
fs.copyFileSync(path.join(root, 'portable-manifest.json'), path.join(copied, 'portable-manifest.json'));
for (const file of manifest.files) {
  const destination = path.join(copied, file.path);
  assert.ok(path.resolve(destination).startsWith(`${copied}${path.sep}`));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file.path), destination);
}
fs.writeFileSync(report, `Math Pad ${manifest.version} clean portable verification\nCopy: ${copied}\n`);
const log = text => fs.appendFileSync(report, `${text}\n`);
const nativeVerify = () => spawnSync(path.join(copied, 'MathPad.exe'), ['--verify'], { cwd: os.tmpdir(), windowsHide: true, encoding: 'utf8', timeout: 60000 });
try {
  assert.equal(fs.existsSync(path.join(copied, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(copied, manifest.runtimeDirectory, 'MathPadHost.exe')), false);
  assert.equal(fs.existsSync(path.join(copied, manifest.runtimeDirectory, '.engine-ready')), false);
  verifyPortable(copied, { quiet: true });
  assert.equal(nativeVerify().status, 0, 'The native --verify command must work without starting Electron');
  const target = path.join(copied, manifest.runtimeDirectory, 'chrome_100_percent.pak');
  const original = fs.readFileSync(target), corrupted = Buffer.from(original);
  corrupted[0] ^= 0xff;
  fs.writeFileSync(target, corrupted);
  assert.throws(() => verifyPortable(copied, { quiet: true }), /checksum mismatch/);
  assert.equal(nativeVerify().status, 1, 'The native verifier must detect corruption and exit without a dialog');
  fs.writeFileSync(target, original);
  fs.renameSync(target, `${target}.missing`);
  assert.throws(() => verifyPortable(copied, { quiet: true }), /ENOENT/);
  assert.equal(nativeVerify().status, 1, 'The native verifier must reject missing runtime files');
  fs.renameSync(`${target}.missing`, target);
  log('FRESH FILES: no Node modules, extracted engine or engine cache; missing/corrupt files detected by both verifiers.');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'smoke-launcher.cjs')], {
    cwd: os.tmpdir(), windowsHide: true, encoding: 'utf8', timeout: 240000,
    env: { ...process.env, MATHPAD_TEST_PORTABLE_ROOT: copied, MATHPAD_TEST_CLEAN_ENV: '1', MATHPAD_TEST_DISABLE_GPU: '1' },
  });
  log(result.stdout || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || 'Clean portable launcher test failed');
  log('CHINESE/SPACED PATH; DIFFERENT WORKING DIRECTORY; NO NODE ON APP PATH; SOFTWARE GRAPHICS VERIFIED');
  // Only remove the temporary tree this script just created, after its processes exit.
  assert.equal(path.dirname(fs.realpathSync(copied)), fs.realpathSync(sandbox));
  assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(root));
  assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(output));
  assert.ok(path.basename(sandbox).startsWith('portable-test-'));
  // Windows can retain executable mappings briefly after the last process exits.
  fs.rmSync(sandbox, { recursive: true, maxRetries: 12, retryDelay: 250 });
  log('TEMPORARY COPY REMOVED; ALL CHECKS PASSED');
  console.log(fs.readFileSync(report, 'utf8'));
} catch (error) {
  log(`FAIL ${error.stack}`);
  console.error(fs.readFileSync(report, 'utf8'));
  process.exitCode = 1;
}
