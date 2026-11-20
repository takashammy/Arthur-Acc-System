import { round2 } from "./money";
import { signedBalance, trialBalance, type Account, type Journal } from "./model";

export interface BookAnomaly {
  level: "warn" | "note";
  message: string;
}

/** Reasonableness checks an accountant would glance at before signing. Not a substitute for review. */
export function bookAnomalies(accounts: Account[], journals: Journal[], entityId: string, asAt: string): BookAnomaly[] {
  const rows = trialBalance(accounts, journals, entityId, { to: asAt });
  const found: BookAnomaly[] = [];
  const cash = rows.filter((row) => /cash|bank/i.test(row.account.name));
  const cashTotal = round2(cash.reduce((sum, row) => sum + signedBalance(row.account, row.balance), 0));
  if (cashTotal < -0.02) found.push({ level: "warn", message: `Cash at bank is overdrawn by ${Math.abs(cashTotal).toLocaleString("en-HK")}.` });
  for (const row of rows) {
    if (row.account.type === "expense" && row.credit > 0) {
      found.push({ level: "note", message: `${row.account.name} is an expense with a credit balance.` });
    }
    if (row.account.type === "revenue" && row.debit > 0) {
      found.push({ level: "note", message: `${row.account.name} is income with a debit balance.` });
    }
  }
  const seen = new Map<string, string>();
  for (const journal of journals) {
    if (journal.entityId !== entityId || journal.date > asAt) continue;
    const amount = round2(journal.lines.reduce((sum, line) => sum + line.debit, 0));
    if (amount <= 0) continue;
    const key = `${journal.date}|${amount.toFixed(2)}`;
    const prior = seen.get(key);
    if (prior && prior !== journal.voucherNumber) {
      found.push({
        level: "note",
        message: `${journal.voucherNumber} and ${prior} are both ${amount.toLocaleString("en-HK")} on ${journal.date}. Check they are not the same entry twice.`,
      });
    } else if (!prior) seen.set(key, journal.voucherNumber);
  }
  return found.slice(0, 8);
}
