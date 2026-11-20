import { round2 } from "./money";

export function leasePresentValue(payment: number, months: number, annualRate: number): number {
  if (months <= 0) return 0;
  const monthly = annualRate / 12;
  if (monthly === 0) return round2(payment * months);
  const factor = (1 - (1 + monthly) ** -months) / monthly;
  return round2(payment * factor);
}

export function leaseCharge(liability: number, payment: number, annualRate: number, cost: number, months: number) {
  const monthly = annualRate / 12;
  let interest = round2(Math.max(liability, 0) * monthly);
  let principal = round2(payment - interest);
  if (principal > liability) {
    principal = round2(liability);
    interest = round2(payment - principal);
  }
  return {
    interest,
    principal,
    depreciation: round2(cost / months),
    liabilityAfter: round2(Math.max(0, liability - principal)),
  };
}
