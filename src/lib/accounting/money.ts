export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatHkd(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}

export function balanced(debit: number, credit: number): boolean {
  return Math.abs(round2(debit) - round2(credit)) < 0.005;
}
