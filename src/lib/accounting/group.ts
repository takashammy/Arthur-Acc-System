import type { Account, Journal } from "./model";
import { round2 } from "./money";

export interface Elimination {
  id: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  reason: string;
  eliminatedOn: string;
}

export interface GroupLine {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

/** Sum every company's trial balance by account code, then apply eliminations. */
export function consolidate(accounts: Account[], journals: Journal[], eliminations: Elimination[]): GroupLine[] {
  const lines = new Map<string, GroupLine>();
  const ensure = (code: string, name: string) => {
    const found = lines.get(code);
    if (found) return found;
    const created = { code, name, debit: 0, credit: 0 };
    lines.set(code, created);
    return created;
  };
  const names = new Map<string, string>();
  for (const account of accounts) names.set(account.id, account.name);
  const codes = new Map<string, string>();
  for (const account of accounts) codes.set(account.id, account.code);
  const labels = new Map<string, string>();
  for (const account of accounts) if (!labels.has(account.code)) labels.set(account.code, account.name);

  for (const journal of journals) {
    if (journal.status !== "posted") continue;
    for (const line of journal.lines) {
      const code = codes.get(line.accountId);
      if (!code) continue;
      const row = ensure(code, labels.get(code) ?? names.get(line.accountId) ?? code);
      row.debit = round2(row.debit + line.debit);
      row.credit = round2(row.credit + line.credit);
    }
  }
  for (const elimination of eliminations) {
    ensure(elimination.debitCode, labels.get(elimination.debitCode) ?? elimination.debitCode).debit = round2(
      (lines.get(elimination.debitCode)?.debit ?? 0) + elimination.amount,
    );
    ensure(elimination.creditCode, labels.get(elimination.creditCode) ?? elimination.creditCode).credit = round2(
      (lines.get(elimination.creditCode)?.credit ?? 0) + elimination.amount,
    );
  }
  for (const line of lines.values()) {
    const net = round2(line.debit - line.credit);
    if (net > 0) {
      line.debit = net;
      line.credit = 0;
    } else if (net < 0) {
      line.debit = 0;
      line.credit = round2(-net);
    } else {
      line.debit = 0;
      line.credit = 0;
    }
  }
  return [...lines.values()]
    .filter((line) => line.debit !== 0 || line.credit !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function groupTotals(lines: GroupLine[]) {
  const debit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  return { debit, credit, agrees: Math.abs(debit - credit) < 0.02 };
}
