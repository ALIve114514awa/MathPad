const { appendFileSync } = require('node:fs');
const path = require('node:path');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  do {
    if (await check()) return;
    await pause(60);
  } while (Date.now() < end);
  throw new Error(message);
}

function createLogger(report) {
  return (...items) => appendFileSync(report,
    items.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ') + '\n');
}

function prepareOfflineWindow(win) {
  // Occlusion by an editor or CI desktop must not stall animation assertions.
  win.webContents.setBackgroundThrottling(false);
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] }, (_, callback) => callback({ cancel: true }));
}

async function clickFloatingBall() {
  const { BrowserWindow } = require('electron');
  let ball;
  await until(() => {
    ball = BrowserWindow.getAllWindows().find(win => win.getTitle() === 'Math Pad · 悬浮球');
    return ball?.isVisible() && !ball.webContents.isLoadingMainFrame();
  }, 'Floating ball did not load');
  await ball.webContents.executeJavaScript("document.querySelector('#floating-ball').click()");
}

function loadApp() {
  const root = process.env.MATHPAD_TEST_APP_ROOT || path.resolve(__dirname, '../..');
  require(path.join(root, 'src', 'main.cjs'));
}

module.exports = { pause, until, createLogger, prepareOfflineWindow, clickFloatingBall, loadApp };
