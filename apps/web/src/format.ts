export function fmt(n: number): string {
  if (!n) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}
