const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { deflateRawSync } = require('node:zlib');
const path = require('node:path');

const root = path.join(__dirname, '..');
const distribution = path.join(root, 'out', 'MathPad-win32-x64');
const runtime = path.join(root, 'runtime');
const files = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function record(relative) {
  const bytes = readFileSync(path.join(root, relative));
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
      record(path.join('runtime', name));
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
  record(path.join('runtime', name));
}
writeFileSync(path.join(runtime, 'engine.json'), `${JSON.stringify({ size: engine.length, sha256: hash(engine), chunks }, null, 2)}\n`);
record(path.join('runtime', 'engine.json'));

const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!existsSync(compiler)) throw new Error('The Windows .NET Framework x64 C# compiler is required to build the root launcher.');
execFileSync(compiler, [
  '/nologo', '/codepage:65001', '/target:winexe', '/platform:x64', '/optimize+', `/out:${path.join(root, 'MathPad.exe')}`,
  '/reference:System.IO.Compression.dll,System.Windows.Forms.dll,System.Web.Extensions.dll',
  path.join(root, 'native', 'Launcher.cs'),
], { stdio: 'inherit' });
record('MathPad.exe');
const { version } = require('../package.json');
writeFileSync(path.join(root, 'portable-manifest.json'), `${JSON.stringify({ version, platform: 'win32-x64', files }, null, 2)}\n`);
console.log(`Portable ${version}: ${files.length} files; root entry MathPad.exe; all runtime files included.`);
