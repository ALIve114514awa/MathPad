const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, '..', 'out', 'native');
const executable = path.join(output, 'MathInputHost.exe');

function buildNative() {
  const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  mkdirSync(output, { recursive: true });
  execFileSync(compiler, [
    '/nologo', '/codepage:65001', '/target:winexe', '/platform:x64', '/optimize+', `/out:${executable}`,
    '/reference:System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll',
    path.join(__dirname, '..', 'native', 'MathInputHost.cs'),
  ], { stdio: 'inherit' });
}

if (require.main === module) buildNative();
module.exports = { buildNative, executable };
