import { cashFlow, signedBalance, statements, tbTotals, trialBalance, type Account, type Journal } from "./model";
import { openTotal, workAssets, yearEndIso, yearStartIso, type FixedAsset, type Invoice, type Settlement } from "./subledger";

export interface CheckItem {
  ok: boolean;
  label: string;
  critical: boolean;
}

export function periodChecks(input: {
  accounts: Account[];
  journals: Journal[];
  entityId: string;
  yearEndLabel: string;
  bankLines: { entityId: string; matchedJournalId: string | null }[];
  links: { journalId: string }[];
  invoices: Invoice[];
  settlements: Settlement[];
  assets: FixedAsset[];
}): CheckItem[] {
  const yearEnd = yearEndIso(input.yearEndLabel);
  const yearStart = yearStartIso(yearEnd);
  const positionRows = trialBalance(input.accounts, input.journals, input.entityId, { to: yearEnd });
  const totals = tbTotals(positionRows);
  const report = statements(positionRows);
  const flow = cashFlow(positionRows, report.incomeTotal);
  const book = (code: string) => {
    const row = positionRows.find((item) => item.account.code === code);
    return row ? signedBalance(row.account, row.balance) : 0;
  };
  const invoices = input.invoices.filter((item) => item.entityId === input.entityId);
  const invoiceIds = new Set(invoices.map((item) => item.id));
  const settlements = input.settlements.filter((item) => invoiceIds.has(item.invoiceId));
  const assets = input.assets.filter((item) => item.entityId === input.entityId);
  const arTies = Math.abs(openTotal(invoices, settlements, "receivable", yearEnd) - book("1100")) < 0.02;
  const apTies = Math.abs(openTotal(invoices, settlements, "payable", yearEnd) - book("2000")) < 0.02;
  const worked = workAssets(assets, input.yearEndLabel);
  const registerCost = worked.reduce((sum, row) => sum + row.asset.cost, 0);
  const registerDep = worked.reduce((sum, row) => sum + row.depreciation, 0);
  const assetTies = Math.abs(registerCost - book("1500")) < 0.02 && Math.abs(registerDep - Math.abs(book("1510"))) < 0.02;
  const mine = input.bankLines.filter((line) => line.entityId === input.entityId);
  const unmatched = mine.filter((line) => !line.matchedJournalId).length;
  const covered = new Set(input.links.map((link) => link.journalId));
  const missingEvidence = input.journals.filter((journal) => journal.entityId === input.entityId && !covered.has(journal.id)).length;
  return [
    { ok: Math.abs(totals.debit - totals.credit) < 0.02, label: "Trial balance agrees", critical: true },
    { ok: report.balanced, label: "Balance sheet agrees", critical: true },
    { ok: flow.ties, label: "Cash flow statement agrees to cash at bank", critical: true },
    { ok: arTies, label: arTies ? "Trade receivables agree to the control account" : "Trade receivables do not agree to the control account", critical: false },
    { ok: apTies, label: apTies ? "Trade payables agree to the control account" : "Trade payables do not agree to the control account", critical: false },
    { ok: assetTies, label: assetTies ? "Fixed asset register agrees to the general ledger" : "Fixed asset register does not agree to the general ledger", critical: false },
    { ok: mine.length > 0 && unmatched === 0, label: mine.length === 0 ? "Bank statement not imported" : "Every bank line is reconciled", critical: mine.length > 0 },
    { ok: missingEvidence === 0, label: missingEvidence === 0 ? "Every voucher has a supporting document" : `${missingEvidence} vouchers have no supporting document`, critical: false },
  ];
}
