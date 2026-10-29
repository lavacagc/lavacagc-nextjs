export function formatRate(rate: number | null): string {
  if (rate === null) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}
