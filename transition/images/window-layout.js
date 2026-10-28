const LEGACY_SIZES = {
  small: [112, 126],
  medium: [184, 188],
  large: [169, 292]
};
const LEGACY_TOPS = [102, 165, 180, 90, 210];
const MAX_WIDTH = 640;
const MAX_HEIGHT = 440;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Read saved drawing geometry, with a fallback for windows made before drawing. */
export function getWindowFrame(record) {
  if (record.frame) {
    const { width, height, y } = record.frame;
    return { width, height, y };
  }
  const [width, height] = LEGACY_SIZES[record.size] || LEGACY_SIZES.medium;
  return { width, height, y: LEGACY_TOPS[0] };
}

/** Lay out already-sorted records. Drawing dimensions never change during packing. */
export function layoutWindows(items) {
  const columns = [];
  for (let index = 0; index < items.length;) {
    const current = items[index], next = items[index + 1];
    const pair = columns.length % 3 === 1 && next && !current.frame && !next.frame
      && current.date.slice(0, 4) === next.date.slice(0, 4);
    columns.push(items.slice(index, index + (pair ? 2 : 1)));
    index += pair ? 2 : 1;
  }

  let x = 360;
  const layouts = [];
  columns.forEach((column, index) => {
    const paired = column.length === 2;
    const width = Math.max(...column.map(record => getWindowFrame(record).width));
    column.forEach((record, row) => {
      const frame = getWindowFrame(record);
      const y = record.frame ? frame.y : paired ? (row ? 358 : 150) : LEGACY_TOPS[index % LEGACY_TOPS.length];
      const height = paired ? Math.min(frame.height, row ? 130 : 195) : frame.height;
      layouts.push({ id: record.id, x, y, width: paired ? width : frame.width, height });
    });
    x += width + (index % 3 === 2 ? 70 : 18);
  });
  return { layouts, end: Math.max(960, x + 70) };
}

/** Convert a drag in world coordinates into a bounded, direction-independent box. */
export function rectangleFromPoints(start, end, bounds = {}) {
  const left = bounds.left ?? 280, top = bounds.top ?? 40;
  const right = Math.max(left, bounds.right ?? Infinity);
  const bottom = Math.max(top, bounds.bottom ?? 520);
  const startX = clamp(start.x, left, right), startY = clamp(start.y, top, bottom);
  const endX = startX + clamp(clamp(end.x, left, right) - startX, -MAX_WIDTH, MAX_WIDTH);
  const endY = startY + clamp(clamp(end.y, top, bottom) - startY, -MAX_HEIGHT, MAX_HEIGHT);
  return {
    x: Math.min(startX, endX), y: Math.min(startY, endY),
    width: Math.abs(endX - startX), height: Math.abs(endY - startY)
  };
}
