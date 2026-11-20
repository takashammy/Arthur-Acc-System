import * as XLSX from "xlsx";
import type { Account, Journal } from "./model";
import { trialBalance } from "./model";
import { formatHkd } from "./money";

function sheet(rows: (string | number)[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

export function downloadAuditFile(input: {
  entityName: string;
  accounts: Account[];
  journals: Journal[];
  documents: { filename: string; id: string }[];
  links: { documentId: string; journalId: string }[];
  entityId: string;
  audit?: { createdAt: string; action: string; detail: string }[];
}) {
  const rows = trialBalance(input.accounts, input.journals, input.entityId);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Audit file — working papers, not a signed opinion"],
      ["Company", input.entityName],
      ["Trial balance"],
      ["Code", "Account", "Debit", "Credit"],
      ...rows.map((row) => [row.account.code, row.account.name, row.debit, row.credit]),
    ]),
    "Trial balance",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Voucher", "Date", "Reason", "Account", "Debit", "Credit", "Line"],
      ...input.journals.flatMap((journal) =>
        journal.lines.map((line) => {
          const account = input.accounts.find((item) => item.id === line.accountId);
          return [journal.voucherNumber, journal.date, journal.reason, account?.code ?? "", line.debit, line.credit, line.description];
        }),
      ),
    ]),
    "Journals",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["File", "Linked vouchers"],
      ...input.documents.map((document) => [
        document.filename,
        input.links
          .filter((link) => link.documentId === document.id)
          .map((link) => input.journals.find((journal) => journal.id === link.journalId)?.voucherNumber ?? "")
          .filter(Boolean)
          .join(", ") || "Not linked",
      ]),
    ]),
    "Evidence",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Check", "Result"],
      ["Debits equal credits", Math.abs(rows.reduce((s, r) => s + r.debit - r.credit, 0)) < 0.02 ? "Agrees" : "Out"],
      ["Voucher count", String(input.journals.length)],
      ["Note", "Figures are the posted books. " + formatHkd(rows.reduce((s, r) => s + r.debit, 0)) + " total debits."],
    ]),
    "Close",
  );
  if (input.audit?.length) {
    XLSX.utils.book_append_sheet(
      book,
      sheet([["When", "Action", "Detail"], ...input.audit.map((event) => [event.createdAt, event.action, event.detail])]),
      "Audit",
    );
  }
  const slug = input.entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(book, `${slug}-audit-file.xlsx`);
}
