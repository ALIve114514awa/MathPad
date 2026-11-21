const { screen } = require('electron');
const { SIZE, RETRACT_DISTANCE, circleShape, dockEdge, edgeOffset, nearButton } = require('./floating-geometry.cjs');

const ANIMATION_TIME = 150;

function createFloatingDock(getWindow, isBusy, initial) {
  let edge, offset = 0, targetCollapsed = false, hideTimer, animation, monitor, disposed = false;
  let enabled = initial.retractBall;
  let hideDelay = initial.retractDelay;
  const window = () => { const win = getWindow(); return win && !win.isDestroyed() ? win : undefined; };
  function cancelHide() { clearTimeout(hideTimer); hideTimer = undefined; }
  function stopAnimation() { clearInterval(animation); animation = undefined; }
  function publish() {
    const win = window();
    if (!win || win.webContents.isDestroyed()) return;
    const shift = edgeOffset(edge, offset);
    if (process.platform === 'win32' || process.platform === 'linux') win.setShape(circleShape(shift.x, shift.y));
    win.webContents.send('floating:presentation', { edge: edge || '', offset, ...shift, retracted: offset === RETRACT_DISTANCE, autoRetract: enabled });
  }
  function expand(immediate = false) { animate(false, immediate); }
  function animate(collapse, immediate = false) {
    cancelHide();
    const target = collapse && edge ? RETRACT_DISTANCE : 0;
    if (!immediate && targetCollapsed === collapse && (animation || offset === target)) return;
    stopAnimation(); targetCollapsed = collapse;
    if (immediate || offset === target) { offset = target; publish(); return; }
    const from = offset, started = performance.now();
    animation = setInterval(() => {
      if (disposed || !window()) { stopAnimation(); return; }
      const progress = Math.min(1, (performance.now() - started) / ANIMATION_TIME);
      const next = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      if (next !== offset) { offset = next; publish(); }
      if (progress === 1) stopAnimation();
    }, 16);
  }
  function refresh() {
    const win = window();
    if (disposed || !enabled || !win || !win.isVisible()) return;
    if (isBusy()) { cancelHide(); return; }
    const bounds = win.getContentBounds();
    const area = screen.getDisplayNearestPoint({ x: bounds.x + SIZE / 2, y: bounds.y + SIZE / 2 }).workArea;
    const nextEdge = dockEdge(bounds, area);
    if (nextEdge !== edge) { cancelHide(); stopAnimation(); edge = nextEdge; offset = 0; targetCollapsed = false; publish(); }
    if (!edge) { cancelHide(); return; }
    if (nearButton(bounds, screen.getCursorScreenPoint(), edge, offset)) { cancelHide(); if (offset || targetCollapsed) expand(); }
    else if (!targetCollapsed && !hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = undefined;
        const current = window();
        if (!disposed && current?.isVisible() && !isBusy() && edge && !nearButton(current.getContentBounds(), screen.getCursorScreenPoint(), edge, offset)) animate(true);
      }, hideDelay);
    }
  }
  function pause() {
    clearInterval(monitor); monitor = undefined; cancelHide(); stopAnimation();
    offset = 0; targetCollapsed = false; publish();
  }
  function resume() {
    if (disposed || !enabled || !window()?.isVisible()) return;
    if (!monitor) monitor = setInterval(refresh, 80);
    refresh();
  }
  return {
    expand, refresh, publish, pause, resume,
    configure({ retractBall, retractDelay }) {
      if (enabled === retractBall && hideDelay === retractDelay) return;
      enabled = retractBall; hideDelay = retractDelay;
      pause();
      resume();
    },
    destroy() { pause(); disposed = true; },
  };
}

module.exports = { createFloatingDock };
