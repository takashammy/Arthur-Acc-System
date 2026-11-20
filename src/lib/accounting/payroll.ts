import { round2 } from "./money";

/** Mandatory MPF, monthly, as it stands in 2026. The proposed higher cap is not in force. */
export const MPF_FLOOR = 7100;
export const MPF_CAP = 30000;
export const MPF_RATE = 0.05;

export interface MpfSplit {
  gross: number;
  employee: number;
  employer: number;
  net: number;
}

export function mpfSplit(gross: number): MpfSplit {
  const pay = round2(Math.max(0, gross));
  const base = Math.min(pay, MPF_CAP);
  const employer = round2(base * MPF_RATE);
  const employee = pay < MPF_FLOOR ? 0 : employer;
  return { gross: pay, employee, employer, net: round2(pay - employee) };
}
