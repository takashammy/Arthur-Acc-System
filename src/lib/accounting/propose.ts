import { readInvoiceText } from "./extract";
import type { Account } from "./model";

export interface JournalProposal {
  party: string;
  date: string;
  amount: number;
  kind: "payable" | "receivable";
  debitCode: string;
  creditCode: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
  source: "rules" | "grok";
}

const EXPENSES: { test: RegExp; code: string; name: string }[] = [
  { test: /rent|tenancy|licence fee/i, code: "6200", name: "Rental fee" },
  { test: /salar|wage|payroll|mpf/i, code: "6100", name: "Staff salaries" },
  { test: /purchas|goods|hardware|stock|inventory|cogs/i, code: "5000", name: "Purchases" },
  { test: /depreciat/i, code: "6500", name: "Depreciation" },
  { test: /audit|legal|professional|accountan/i, code: "6400", name: "Administrative expenses" },
  { test: /electric|water|utilit|telephone|internet|insurance|postage/i, code: "6400", name: "Administrative expenses" },
];

function pick(accounts: Account[], entityId: string, code: string, name: string): string {
  const mine = accounts.filter((account) => account.entityId === entityId);
  return mine.find((account) => account.code === code)?.code
    ?? mine.find((account) => account.name.toLowerCase() === name.toLowerCase())?.code
    ?? code;
}

/** Suggest a two-line journal from invoice text. The accountant accepts or edits it before anything is posted. */
export function proposeJournal(
  text: string,
  accounts: Account[],
  entityId: string,
  kind: "payable" | "receivable",
): JournalProposal | { error: string } {
  const read = readInvoiceText(text);
  if (!read.party || !read.date || !read.amount) {
    return { error: read.note };
  }
  if (kind === "receivable") {
    return {
      party: read.party,
      date: read.date,
      amount: read.amount,
      kind,
      debitCode: pick(accounts, entityId, "1100", "Accounts receivable"),
      creditCode: pick(accounts, entityId, "4000", "Sales"),
      confidence: "high",
      rationale: `Sales invoice from ${read.party}. Debit trade receivables and credit sales. Confirm the customer and the amount before accepting.`,
      source: "rules",
    };
  }
  const blob = `${read.party} ${text}`;
  const expense = EXPENSES.find((rule) => rule.test.test(blob));
  return {
    party: read.party,
    date: read.date,
    amount: read.amount,
    kind,
    debitCode: expense ? pick(accounts, entityId, expense.code, expense.name) : pick(accounts, entityId, "6400", "Administrative expenses"),
    creditCode: pick(accounts, entityId, "2000", "Accounts payable"),
    confidence: expense ? "high" : "medium",
    rationale: expense
      ? `Supplier bill from ${read.party}. The wording matches ${expense.name.toLowerCase()}, so that account is suggested and trade payables is credited.`
      : `Supplier bill from ${read.party}. No expense keyword matched, so administrative expenses is suggested. Change the debit account if that is wrong.`,
    source: "rules",
  };
}
