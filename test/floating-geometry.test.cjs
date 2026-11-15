const test = require('node:test');
const assert = require('node:assert/strict');
const { SIZE, PEEK, RETRACT_DISTANCE, constrain, remember, restore, circleShape, dockEdge, edgeOffset, nearButton } = require('../src/floating-geometry.cjs');

const main = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const left = { id: 2, workArea: { x: -1280, y: -160, width: 1280, height: 960 } };
test('floating button stays free away from edges, snaps near edges and avoids the taskbar', () => {
  assert.deepEqual(constrain({ x: 800, y: 350 }, main.workArea, true), { x: 800, y: 350, width: SIZE, height: SIZE });
  assert.deepEqual(constrain({ x: 18, y: 18 }, main.workArea, true), { x: 0, y: 0, width: SIZE, height: SIZE });
  assert.deepEqual(constrain({ x: 1854, y: 980 }, main.workArea, true), { x: 1872, y: 992, width: SIZE, height: SIZE });
  assert.equal(constrain({ x: 25, y: 100 }, main.workArea, true).x, 25);
  assert.equal(constrain({ x: -5000, y: 3000 }, main.workArea, true).y + SIZE, 1040);
  assert.deepEqual(constrain({ x: -1270, y: -150 }, left.workArea, true), { x: -1280, y: -160, width: SIZE, height: SIZE });
});
test('fresh startup and legacy positions default to the left edge at vertical center', () => {
  const centered = { x: 0, y: 496, width: SIZE, height: SIZE };
  assert.deepEqual(restore(undefined, [main, left], main), centered);
  assert.deepEqual(restore(undefined, [main, left], left), { x: -1280, y: 296, width: SIZE, height: SIZE });
  assert.deepEqual(restore({ version: 1, displayId: 1, xRatio: 1, yRatio: .42 }, [main], main), centered);
  assert.deepEqual(restore({ version: 2, xRatio: NaN, yRatio: 3 }, [main], main), centered);
});
test('positions survive DPI/work-area changes and a disconnected negative-coordinate display', () => {
  const saved = remember({ x: -48, y: 752 }, left, false);
  assert.equal(saved.version, 2);
  assert.equal(saved.visible, false);
  assert.deepEqual(restore(saved, [main, left], main), { x: -48, y: 752, width: SIZE, height: SIZE });
  const changed = { id: 2, workArea: { x: -960, y: 0, width: 960, height: 700 } };
  assert.deepEqual(restore(saved, [main, changed], main), { x: -48, y: 652, width: SIZE, height: SIZE });
  assert.deepEqual(restore(saved, [main], main), { x: 1872, y: 992, width: SIZE, height: SIZE });
});
test('native shape covers the visible circle and lets its transparent corners pass through', () => {
  const shape = circleShape();
  const hit = (x, y) => shape.some(rect=>x>=rect.x && x<rect.x+rect.width && y>=rect.y && y<rect.y+rect.height);
  assert.ok(hit(24, 24)); assert.ok(hit(24, 0)); assert.ok(hit(1, 24));
  for (const point of [[0,0],[47,0],[0,47],[47,47]]) assert.equal(hit(...point), false);
  for (let y = 0; y < SIZE; y++) assert.ok(hit(24,y));
});

test('edge retraction leaves only the visible strip interactive on all four sides', () => {
  for (const edge of ['left','right','top','bottom']) {
    const shift = edgeOffset(edge, RETRACT_DISTANCE);
    const shape = circleShape(shift.x,shift.y);
    assert.ok(shape.length>0);
    for (const rect of shape) {
      assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=SIZE && rect.y+rect.height<=SIZE);
      if(edge==='left')assert.ok(rect.x+rect.width<=PEEK);
      if(edge==='right')assert.ok(rect.x>=SIZE-PEEK);
      if(edge==='top')assert.ok(rect.y+rect.height<=PEEK);
      if(edge==='bottom')assert.ok(rect.y>=SIZE-PEEK);
    }
  }
});

test('only docked positions retract and the exposed strip has a forgiving hover target', () => {
  assert.equal(dockEdge({x:0,y:300},main.workArea),'left');
  assert.equal(dockEdge({x:1872,y:300},main.workArea),'right');
  assert.equal(dockEdge({x:300,y:0},main.workArea),'top');
  assert.equal(dockEdge({x:300,y:992},main.workArea),'bottom');
  assert.equal(dockEdge({x:300,y:300},main.workArea),undefined);
  const bounds={x:1872,y:300,width:48,height:48};
  assert.equal(nearButton(bounds,{x:1918,y:324},'right',32),true);
  assert.equal(nearButton(bounds,{x:1880,y:324},'right',32),false);
  assert.equal(nearButton(bounds,{x:1870,y:324},'right',0),true);
});
