const { spawn } = require('node:child_process');
const path = require('node:path');

function createNativeMathInput(isPackaged) {
  const executable = isPackaged
    ? path.join(process.resourcesPath, 'MathInputHost.exe')
    : path.join(__dirname, '..', 'out', 'native', 'MathInputHost.exe');
  let active;

  function open(owner) {
    if (active) return active.promise;
    if (process.platform !== 'win32' || process.arch !== 'x64') return { status: 'unavailable' };
    const handle = owner.getNativeWindowHandle().readBigUInt64LE().toString(16);
    const child = spawn(executable, [handle], { stdio: ['pipe', 'pipe', 'ignore'] });
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    let result;
    let stopTimer;
    let buffer = '';

    function stop(value) {
      if (result) return;
      result = value;
      clearTimeout(startupTimer);
      child.stdin.end();
      stopTimer = setTimeout(() => child.kill(), 800);
    }

    const startupTimer = setTimeout(() => stop({ status: 'unavailable' }), 8000);
    active = { promise, cancel: () => stop({ status: 'cancelled' }) };
    child.stdin.on('error', () => {}); // The helper may exit before the parent closes its pipe.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      if (result) return;
      buffer += data;
      if (buffer.length > 160000) return stop({ status: 'unavailable' });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { return stop({ status: 'unavailable' }); }
        if (message?.status === 'shown') {
          clearTimeout(startupTimer);
        } else if (message?.status === 'inserted' && typeof message.mathml === 'string' && message.mathml.length <= 25000) {
          return stop({ status: 'inserted', mathml: message.mathml });
        } else if (message?.status === 'cancelled') {
          return stop({ status: 'cancelled' });
        } else {
          return stop({ status: 'unavailable' });
        }
      }
    });
    child.on('error', () => stop({ status: 'unavailable' }));
    child.once('close', () => {
      clearTimeout(startupTimer);
      clearTimeout(stopTimer);
      active = undefined;
      resolve(result ?? { status: 'unavailable' });
    });
    return promise;
  }

  return { open, cancel: () => active?.cancel() };
}

module.exports = { createNativeMathInput };
