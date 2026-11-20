import { round2 } from "./money";
import { accountFlow, statements, trialBalance, type Account, type Journal } from "./model";

export interface MonthPoint {
  month: string;
  sales: number;
  costs: number;
  result: number;
}

/** Sales, costs and result by calendar month, for journals inside the range. */
export function monthlyResult(
  accounts: Account[],
  journals: Journal[],
  entityId: string,
  from: string,
  to: string,
): MonthPoint[] {
  const typeOf = new Map(accounts.filter((account) => account.entityId === entityId).map((account) => [account.id, account.type]));
  const buckets = new Map<string, { sales: number; costs: number }>();
  for (const journal of journals) {
    if (journal.entityId !== entityId || journal.status !== "posted") continue;
    if (journal.date < from || journal.date > to) continue;
    const key = journal.date.slice(0, 7);
    const bucket = buckets.get(key) ?? { sales: 0, costs: 0 };
    for (const line of journal.lines) {
      const type = typeOf.get(line.accountId);
      if (type === "revenue") bucket.sales = round2(bucket.sales + line.credit - line.debit);
      if (type === "expense") bucket.costs = round2(bucket.costs + line.debit - line.credit);
    }
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      sales: value.sales,
      costs: value.costs,
      result: round2(value.sales - value.costs),
    }));
}

/** Balance sheet split as at a date. Non-current is plant, property and other investing assets. */
export function balanceComposition(accounts: Account[], journals: Journal[], entityId: string, asAt: string) {
  const rows = trialBalance(accounts, journals, entityId, { to: asAt });
  const report = statements(rows);
  let nonCurrent = 0;
  let current = 0;
  for (const row of rows) {
    if (row.account.type !== "asset" && row.account.type !== "contra_asset") continue;
    const amount = row.account.type === "contra_asset" ? -Math.abs(row.balance) : row.balance;
    const investing = accountFlow(row.account) === "investing" || row.account.code.startsWith("15");
    if (investing) nonCurrent = round2(nonCurrent + amount);
    else current = round2(current + amount);
  }
  return {
    nonCurrent,
    current,
    liabilities: report.liabilityTotal,
    equity: report.equityTotal,
    report,
    rows,
  };
}

export function namedBalance(accounts: Account[], journals: Journal[], entityId: string, asAt: string, test: (name: string, code: string) => boolean): number {
  const rows = trialBalance(accounts, journals, entityId, { to: asAt });
  return round2(
    rows
      .filter((row) => test(row.account.name, row.account.code))
      .reduce((sum, row) => sum + row.balance, 0),
  );
}
