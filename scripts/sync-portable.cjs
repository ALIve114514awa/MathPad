const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { deflateRawSync } = require('node:zlib');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { version } = require('../package.json');
const distribution = path.join(root, 'out', 'MathPad-win32-x64');
const runtimeDirectory = 'runtime';
const staging = mkdtempSync(path.join(root, 'out', 'portable-build-'));
const runtime = path.join(staging, runtimeDirectory);
const files = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function record(relative) {
  const bytes = readFileSync(path.join(staging, relative));
  files.push({ path: relative.replaceAll('\\', '/'), size: bytes.length, sha256: hash(bytes) });
}

function copyDirectory(relative = '') {
  for (const entry of readdirSync(path.join(distribution, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    const destination = path.join(runtime, name);
    if (entry.isDirectory()) {
      mkdirSync(destination, { recursive: true });
      copyDirectory(name);
    } else if (name !== 'MathPad.exe') {
      copyFileSync(path.join(distribution, name), destination);
      record(path.join(runtimeDirectory, name));
    }
  }
}

mkdirSync(runtime, { recursive: true });
copyDirectory();
const engine = readFileSync(path.join(distribution, 'MathPad.exe'));
const chunks = [];
const chunkSize = 128 * 1024 * 1024;
for (let offset = 0; offset < engine.length; offset += chunkSize) {
  const name = `engine-${chunks.length + 1}.deflate`;
  const compressed = deflateRawSync(engine.subarray(offset, offset + chunkSize), { level: 9 });
  if (compressed.length >= 100 * 1024 * 1024) throw new Error(`${name} exceeds GitHub's file limit`);
  writeFileSync(path.join(runtime, name), compressed);
  chunks.push(name);
  record(path.join(runtimeDirectory, name));
}
writeFileSync(path.join(runtime, 'engine.json'), `${JSON.stringify({ size: engine.length, sha256: hash(engine), chunks }, null, 2)}\n`);
record(path.join(runtimeDirectory, 'engine.json'));

const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!existsSync(compiler)) throw new Error('The Windows .NET Framework x64 C# compiler is required to build the root launcher.');
execFileSync(compiler, [
  '/nologo', '/codepage:65001', '/target:winexe', '/platform:x64', '/optimize+', `/out:${path.join(staging, 'MathPad.exe')}`,
  `/win32icon:${path.join(root, 'assets', 'mathpad.ico')}`,
  '/reference:System.IO.Compression.dll,System.Windows.Forms.dll,System.Web.Extensions.dll',
  path.join(root, 'native', 'Launcher.cs'),
], { stdio: 'inherit' });
record('MathPad.exe');
writeFileSync(path.join(staging, 'portable-manifest.json'), `${JSON.stringify({ version, platform: 'win32-x64', runtimeDirectory, files }, null, 2)}\n`);
require('./verify-portable.cjs').verifyPortable(staging);

const destination = path.join(root, runtimeDirectory);
const installedEngine = path.join(destination, 'MathPadHost.exe');
if (existsSync(installedEngine)) {
  try { closeSync(openSync(installedEngine, 'r+')); }
  catch { throw new Error('请先从托盘完全退出正在运行的 Math Pad，并确认项目目录可写，然后重新运行 portable:local。旧运行文件未修改。'); }
}
const backup = path.join(staging, 'previous');
mkdirSync(backup);
for (const name of ['MathPad.exe', 'portable-manifest.json']) {
  if (existsSync(path.join(root, name))) copyFileSync(path.join(root, name), path.join(backup, name));
}
let movedPrevious = false, installed = false;
try {
  if (existsSync(destination)) { renameSync(destination, path.join(backup, runtimeDirectory)); movedPrevious = true; }
  renameSync(runtime, destination); installed = true;
  copyFileSync(path.join(staging, 'MathPad.exe'), path.join(root, 'MathPad.exe'));
  copyFileSync(path.join(staging, 'portable-manifest.json'), path.join(root, 'portable-manifest.json'));
} catch (error) {
  if (installed) renameSync(destination, path.join(staging, 'uninstalled-runtime'));
  if (movedPrevious) renameSync(path.join(backup, runtimeDirectory), destination);
  for (const name of ['MathPad.exe', 'portable-manifest.json']) {
    if (existsSync(path.join(backup, name))) copyFileSync(path.join(backup, name), path.join(root, name));
  }
  throw error;
}
console.log(`Portable ${version}: ${files.length} files; root entry MathPad.exe; all runtime files included.`);
console.log('Previous local runtime, if any, is backed up under out/portable-build-*/previous/.');
