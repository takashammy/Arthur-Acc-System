import * as XLSX from "xlsx";
import type { CashFlowStatement, StatementLine, Statements, TbRow } from "./model";
import { tbTotals } from "./model";

function lines(rows: (string | number)[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function statementRows(title: string, items: StatementLine[], totalLabel: string, total: number) {
  return [
    [title],
    ["Code", "Line", "HKD"],
    ...items.map((line) => [line.code, line.name, line.amount]),
    ["", totalLabel, total],
  ];
}

export function downloadManagementPack(input: {
  entityName: string;
  period: string;
  rows: TbRow[];
  report: Statements;
  flow: CashFlowStatement;
}) {
  const totals = tbTotals(input.rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    lines([
      [input.entityName, input.period],
      ["Code", "Account", "Debit", "Credit"],
      ...input.rows.map((row) => [row.account.code, row.account.name, row.debit, row.credit]),
      ["", "Total", totals.debit, totals.credit],
    ]),
    "Trial balance",
  );
  XLSX.utils.book_append_sheet(
    book,
    lines(statementRows("Profit and loss", input.report.income, input.report.incomeTotal >= 0 ? "Profit" : "Loss", input.report.incomeTotal)),
    "Profit and loss",
  );
  XLSX.utils.book_append_sheet(
    book,
    lines([
      ...statementRows("Assets", input.report.assets, "Total assets", input.report.assetTotal),
      [],
      ...statementRows("Liabilities", input.report.liabilities, "Total liabilities", input.report.liabilityTotal),
      [],
      ...statementRows("Equity", input.report.equity, "Total equity", input.report.equityTotal),
      [],
      ["Net assets", input.report.netAssets],
    ]),
    "Balance sheet",
  );
  XLSX.utils.book_append_sheet(
    book,
    lines([
      ["Cash flow"],
      ["Profit / (loss)", input.flow.profit],
      ...input.flow.operating.map((line) => [line.name, line.amount]),
      ["Net cash from operating activities", input.flow.operatingTotal],
      ...input.flow.investing.map((line) => [line.name, line.amount]),
      ["Net cash from investing activities", input.flow.investingTotal],
      ...input.flow.financing.map((line) => [line.name, line.amount]),
      ["Net cash from financing activities", input.flow.financingTotal],
      ["Net increase in cash", input.flow.net],
      ["Cash at bank", input.flow.cashMovement],
    ]),
    "Cash flow",
  );
  const slug = input.entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(book, `${slug}-management-accounts.xlsx`);
}
