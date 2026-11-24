export function mapCoordinates(x,y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>1080 || y<0 || y>540) return null;
  return { longitude:x/3-180, latitude:90-y/3 };
}

export function formatCoordinates({ latitude,longitude }) {
  return `${Math.abs(latitude).toFixed(4)}° ${latitude<0?'S':'N'}\n${Math.abs(longitude).toFixed(4)}° ${longitude<0?'W':'E'}`;
}
