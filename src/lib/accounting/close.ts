import { round2 } from "./money";
import type { TbRow } from "./model";

export interface ClosingLine {
  accountId: string;
  name: string;
  debit: number;
  credit: number;
  description: string;
}

/** Zero income and expense into retained earnings. The closing journal must balance. */
export function closingLines(rows: TbRow[], retained: { id: string; name: string }): { lines: ClosingLine[]; profit: number } {
  const lines: ClosingLine[] = [];
  for (const row of rows) {
    if (row.account.type !== "revenue" && row.account.type !== "expense") continue;
    if (row.account.id === retained.id) continue;
    if (row.debit > 0) {
      lines.push({
        accountId: row.account.id,
        name: row.account.name,
        debit: 0,
        credit: row.debit,
        description: "Year-end close",
      });
    } else if (row.credit > 0) {
      lines.push({
        accountId: row.account.id,
        name: row.account.name,
        debit: row.credit,
        credit: 0,
        description: "Year-end close",
      });
    }
  }
  const debit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  const profit = round2(debit - credit);
  if (profit > 0) {
    lines.push({ accountId: retained.id, name: retained.name, debit: 0, credit: profit, description: "Profit for the year" });
  } else if (profit < 0) {
    lines.push({ accountId: retained.id, name: retained.name, debit: round2(-profit), credit: 0, description: "Loss for the year" });
  }
  return { lines, profit };
}
