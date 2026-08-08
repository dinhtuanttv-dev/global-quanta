export function formatVND(value: number): string {
  return value.toLocaleString('vi-VN');
}

export function formatPct(value: number, withSign = true): string {
  const sign = withSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatSignedInt(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}`;
}
