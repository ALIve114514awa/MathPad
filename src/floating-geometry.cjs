// Edge proximity snapping follows Overlet's snapAxis approach (MIT).
// https://github.com/kwhyu/overlet — see THIRD_PARTY_NOTICES.md.
const SIZE = 48;
const SNAP_DISTANCE = 24;
const DRAG_DISTANCE = 5;
const PEEK = 16;
const RETRACT_DISTANCE = SIZE - PEEK;
const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));

function constrain(bounds, area, snap = false) {
  let x = clamp(bounds.x, area.x, area.x + area.width - SIZE);
  let y = clamp(bounds.y, area.y, area.y + area.height - SIZE);
  if (snap) {
    if (Math.abs(x - area.x) <= SNAP_DISTANCE) x = area.x;
    else if (Math.abs(x + SIZE - area.x - area.width) <= SNAP_DISTANCE) x = area.x + area.width - SIZE;
    if (Math.abs(y - area.y) <= SNAP_DISTANCE) y = area.y;
    else if (Math.abs(y + SIZE - area.y - area.height) <= SNAP_DISTANCE) y = area.y + area.height - SIZE;
  }
  return { x: Math.round(x), y: Math.round(y), width: SIZE, height: SIZE };
}

function remember(bounds, display, visible = true) {
  const area = display.workArea;
  return {
    version: 2, visible, displayId: display.id,
    xRatio: clamp((bounds.x - area.x) / Math.max(1, area.width - SIZE), 0, 1),
    yRatio: clamp((bounds.y - area.y) / Math.max(1, area.height - SIZE), 0, 1),
  };
}

function restore(settings, displays, fallback) {
  // Version 1 predates quiet startup; move it to the new default once on upgrade.
  const valid = settings?.version === 2 && Number.isFinite(settings.xRatio) && Number.isFinite(settings.yRatio);
  const display = valid ? displays.find(item => item.id === settings.displayId) || fallback : fallback;
  const area = display.workArea;
  return constrain({
    x: area.x + (area.width - SIZE) * (valid ? clamp(settings.xRatio, 0, 1) : 0),
    y: area.y + (area.height - SIZE) * (valid ? clamp(settings.yRatio, 0, 1) : .5),
  }, area);
}

function dockEdge(bounds, area) {
  if (Math.abs(bounds.x - area.x) <= 1) return 'left';
  if (Math.abs(bounds.x + SIZE - area.x - area.width) <= 1) return 'right';
  if (Math.abs(bounds.y - area.y) <= 1) return 'top';
  if (Math.abs(bounds.y + SIZE - area.y - area.height) <= 1) return 'bottom';
  return undefined;
}

function edgeOffset(edge, distance) {
  return { x: edge === 'left' ? -distance : edge === 'right' ? distance : 0,
    y: edge === 'top' ? -distance : edge === 'bottom' ? distance : 0 };
}

function nearButton(bounds, point, edge, distance) {
  const shift = edgeOffset(edge, distance);
  const left = bounds.x + Math.max(0, shift.x) - 6, right = bounds.x + Math.min(SIZE, SIZE + shift.x) + 6;
  const top = bounds.y + Math.max(0, shift.y) - 6, bottom = bounds.y + Math.min(SIZE, SIZE + shift.y) + 6;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function circleShape(offsetX = 0, offsetY = 0) {
  const rects = [];
  for (let y = 0; y < SIZE; y++) {
    const squared = (SIZE / 2) ** 2 - (y + .5 - SIZE / 2 - offsetY) ** 2;
    if (squared <= 0) continue;
    const half = Math.sqrt(squared);
    const x = Math.max(0, Math.ceil(SIZE / 2 - half + offsetX));
    const width = Math.min(SIZE, Math.floor(SIZE / 2 + half + offsetX)) - x;
    const last = rects.at(-1);
    if (last && last.x === x && last.width === width) last.height++;
    else if (width > 0) rects.push({ x, y, width, height: 1 });
  }
  return rects;
}

module.exports = { SIZE, SNAP_DISTANCE, DRAG_DISTANCE, PEEK, RETRACT_DISTANCE, constrain, remember, restore, circleShape, dockEdge, edgeOffset, nearButton };
