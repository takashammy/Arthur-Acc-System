import * as XLSX from "xlsx";
import type { AssetWork } from "./subledger";
import type { TaxComputation } from "./tax";

function sheet(rows: (string | number)[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function save(book: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(book, filename);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function downloadBir51(input: {
  entityName: string;
  crNumber: string;
  yearEnd: string;
  tax: TaxComputation;
  assets: AssetWork[];
  bookDepreciation: number;
}) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Profits tax working — not the form filed with the Inland Revenue Department"],
      ["Company", input.entityName],
      ["CR number", input.crNumber],
      ["Year of assessment", "2025/26"],
      ["Basis period", `Year ended ${input.yearEnd}`],
      ["Two-tiered rate", "Draft election. Confirm no connected entity has already elected."],
      ["Rates", "8.25% on the first HK$2,000,000, then 16.5%"],
    ]),
    "Particulars",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Computation", "HKD"],
      ["Accounting profit / (loss)", input.tax.accountingProfit],
      ["Add: depreciation charged in the books", input.tax.depreciationAddBack],
      ["Less: capital allowance", input.tax.capitalAllowance],
      ["Other additions", input.tax.added],
      ["Other deductions", input.tax.deducted],
      ["Assessable profits / (loss)", input.tax.assessable],
      ["First HK$2,000,000 at 8.25%", input.tax.firstBand],
      ["Remainder at 16.5%", input.tax.upperBand],
      ["Tax payable", input.tax.tax],
      ["Loss brought forward", input.tax.lossBrought],
      ["Loss brought forward used", input.tax.lossUsed],
      ["Loss carried forward", input.tax.lossCarried],
      [],
      [input.tax.allowanceNote],
      [],
      ["Depreciation on the asset register", input.bookDepreciation],
    ]),
    "Computation",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Asset", "Category", "Cost", "Book depreciation", "Capital allowance", "Note"],
      ...input.assets.map((row) => [
        row.asset.name,
        row.asset.category,
        row.asset.cost,
        row.depreciation,
        row.allowance,
        row.note,
      ]),
    ]),
    "Capital allowances",
  );
  save(book, `${slug(input.entityName)}-profits-tax-working.xlsx`);
}

export function downloadNar1(input: {
  entityName: string;
  crNumber: string;
  incorporated: string;
  madeUpTo: string;
  due: string;
  office: string;
  shareCapital: number;
  officers: { role: string; name: string; detail: string; appointed: string }[];
  capitalAgrees: boolean;
}) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["NAR1 working — not the annual return filed with the Companies Registry"],
      ["Company", input.entityName],
      ["CR number", input.crNumber],
      ["Type", "Private company limited by shares"],
      ["Incorporated", input.incorporated],
      ["Return made up to", input.madeUpTo],
      ["File by", input.due],
      ["Registered office", input.office || "Missing"],
    ]),
    "Particulars",
  );
  const members = input.officers.filter((officer) => officer.role === "shareholder");
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Issued share capital in the books", input.shareCapital],
      ["Agrees with the member register", input.capitalAgrees ? "Yes" : "No — check before filing"],
      [],
      ["Member", "Holding", "Appointed"],
      ...members.map((officer) => [officer.name, officer.detail, officer.appointed]),
    ]),
    "Capital",
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet([
      ["Role", "Name", "Detail", "Appointed"],
      ...input.officers
        .filter((officer) => officer.role !== "shareholder")
        .map((officer) => [officer.role, officer.name, officer.detail, officer.appointed]),
      [],
      ["Still to confirm before filing"],
      ["Business nature"],
      ["Email and Hong Kong contact number"],
      ["Mortgages and charges"],
      ["Whether any share transfer happened in the year"],
    ]),
    "Officers",
  );
  save(book, `${slug(input.entityName)}-nar1-working.xlsx`);
}
