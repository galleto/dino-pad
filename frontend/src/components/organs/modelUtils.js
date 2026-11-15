export const MODEL_COLORS = {
  ok: '#72f5a4',
  warn: '#f5b84f',
  crit: '#ff5f68',
  nodata: '#7d8996',
};

export function colorForStatus(status, signal = true) {
  if (!signal || status === 'nodata') return MODEL_COLORS.nodata;
  return MODEL_COLORS[status] || MODEL_COLORS.ok;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizedValue(value, range) {
  const minimum = Number.isFinite(range?.min) ? range.min : 0;
  const maximum = Number.isFinite(range?.max) ? range.max : 10;
  return clamp((Number(value) - minimum) / (maximum - minimum || 1), 0, 1);
}
