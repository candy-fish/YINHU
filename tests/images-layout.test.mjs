import test from 'node:test';
import assert from 'node:assert/strict';
import { getWindowFrame, layoutWindows, rectangleFromPoints } from '../transition/images/window-layout.js';

test('drawn rectangles normalize reverse drags without imposing a minimum size', () => {
  const bounds = { left: 280, right: 1700, top: 40, bottom: 520 };
  assert.deepEqual(rectangleFromPoints({ x: 700, y: 360 }, { x: 380, y: 120 }, bounds), { x: 380, y: 120, width: 320, height: 240 });
  assert.deepEqual(rectangleFromPoints({ x: 380, y: 120 }, { x: 700, y: 360 }, bounds), { x: 380, y: 120, width: 320, height: 240 });
  assert.deepEqual(rectangleFromPoints({ x: 400, y: 100 }, { x: 403, y: 102 }, bounds), { x: 400, y: 100, width: 3, height: 2 });
});

test('drawing stays in the scene and maximum sizes stay anchored to the drag start', () => {
  const bounds = { left: 280, right: 1800, top: 40, bottom: 520 };
  assert.deepEqual(rectangleFromPoints({ x: 200, y: 20 }, { x: 2000, y: 700 }, bounds), { x: 280, y: 40, width: 640, height: 440 });
  assert.deepEqual(rectangleFromPoints({ x: 1700, y: 510 }, { x: 50, y: -100 }, bounds), { x: 1060, y: 70, width: 640, height: 440 });
  assert.deepEqual(rectangleFromPoints({ x: 1700, y: 480 }, { x: 2000, y: 700 }, bounds), { x: 1700, y: 480, width: 100, height: 40 });
});

test('custom windows keep their drawn geometry, chronological input order and separate columns', () => {
  const records = [
    { id: 'old', date: '2024-01-01', frame: { width: 520, height: 390, y: 70 } },
    { id: 'middle', date: '2025-01-01', frame: { width: 110, height: 95, y: 421 } },
    { id: 'new', date: '2025-08-01', frame: { width: 640, height: 440, y: 40 } }
  ];
  const original = structuredClone(records);
  const { layouts, end } = layoutWindows(records);
  assert.deepEqual(records, original);
  assert.deepEqual(layouts.map(layout => layout.id), ['old', 'middle', 'new']);
  layouts.forEach((layout, index) => {
    assert.deepEqual({ width: layout.width, height: layout.height, y: layout.y }, records[index].frame);
    if (index) assert.ok(layout.x >= layouts[index - 1].x + layouts[index - 1].width + 18);
  });
  assert.equal(layouts[0].x, 360);
  assert.ok(end > layouts.at(-1).x + layouts.at(-1).width);
});

test('legacy windows keep their size fallback and collage pairing without shrinking drawings', () => {
  assert.deepEqual(getWindowFrame({ size: 'small' }), { width: 112, height: 126, y: 102 });
  assert.deepEqual(getWindowFrame({ size: 'medium' }), { width: 184, height: 188, y: 102 });
  assert.deepEqual(getWindowFrame({ size: 'large' }), { width: 169, height: 292, y: 102 });
  const { layouts } = layoutWindows([
    { id: 'first', date: '2023-01-01', size: 'large' },
    { id: 'second', date: '2024-01-01', size: 'large' },
    { id: 'third', date: '2024-08-01', size: 'medium' },
    { id: 'drawn', date: '2024-09-01', frame: { width: 400, height: 300, y: 60 } }
  ]);
  assert.deepEqual(layouts[0], { id: 'first', x: 360, y: 102, width: 169, height: 292 });
  assert.equal(layouts[1].x, layouts[2].x);
  assert.ok(layouts[1].y + layouts[1].height < layouts[2].y);
  assert.equal(layouts[3].width, 400);
  assert.equal(layouts[3].height, 300);
  assert.equal(layouts[3].y, 60);
});
