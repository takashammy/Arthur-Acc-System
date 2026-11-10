import * as XLSX from "xlsx";
import { balanced, round2 } from "./money";

export interface ImportIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

export interface ImportLine {
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  rawDate?: string;
}

export interface ImportVoucher {
  voucherNumber: string;
  date: string;
  lines: ImportLine[];
  issues: ImportIssue[];
  blockIndex?: number;
}

export interface ImportResult {
  fileName: string;
  sheetNames: string[];
  vouchers: ImportVoucher[];
  issues: ImportIssue[];
  source: "journal" | "csv" | "none";
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function excelSerialToIso(serial: number): string {
  const ms = EXCEL_EPOCH + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHeader(cells: string[]): boolean {
  const blob = cells.join(" ").toLowerCase();
  return /date|voucher|ledger|account|amount|description|particular/.test(blob);
}

function columnIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return round2(value);
  const text = norm(value).replace(/,/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? round2(n) : null;
}

function parseDate(value: unknown): { iso: string; raw: string } | null {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return { iso: excelSerialToIso(value), raw: String(value) };
  }
  const text = norm(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return { iso: text.slice(0, 10), raw: text };
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return { iso, raw: text };
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString().slice(0, 10), raw: text };
  return null;
}

function signedToColumns(amount: number): { debit: number; credit: number } {
  if (amount >= 0) return { debit: amount, credit: 0 };
  return { debit: 0, credit: round2(-amount) };
}

interface RawJournalRow {
  date: { iso: string; raw: string } | null;
  voucher: string;
  account: string;
  description: string;
  amount: number | null;
}

function rowsFromMatrix(matrix: unknown[][]): RawJournalRow[] {
  const table = matrix.filter((row) => row.some((cell) => norm(cell) !== ""));
  if (table.length === 0) return [];
  const first = table[0].map((cell) => norm(cell).toLowerCase());
  let dateIdx = 0;
  let voucherIdx = 1;
  let accountIdx = 2;
  let descriptionIdx = 3;
  let amountIdx = 4;
  let start = 0;
  if (looksLikeHeader(first)) {
    start = 1;
    const foundDate = columnIndex(first, [/date/]);
    const foundVoucher = columnIndex(first, [/voucher/, /jv/, /ref/]);
    const foundAccount = columnIndex(first, [/ledger/, /account/, /code/, /category/]);
    const foundDesc = columnIndex(first, [/desc/, /particular/, /narrat/]);
    const foundAmount = columnIndex(first, [/amount/, /signed/, /hkd/, /balance/]);
    if (foundDate >= 0) dateIdx = foundDate;
    if (foundVoucher >= 0) voucherIdx = foundVoucher;
    if (foundAccount >= 0) accountIdx = foundAccount;
    if (foundDesc >= 0) descriptionIdx = foundDesc;
    if (foundAmount >= 0) amountIdx = foundAmount;
  }
  return table.slice(start).map((row) => ({
    date: parseDate(row[dateIdx]),
    voucher: norm(row[voucherIdx]),
    account: norm(row[accountIdx]),
    description: norm(row[descriptionIdx]),
    amount: parseAmount(row[amountIdx]),
  }));
}

function groupVouchers(rows: RawJournalRow[]): ImportVoucher[] {
  const groups = new Map<string, RawJournalRow[]>();
  const order: string[] = [];
  rows.forEach((row, index) => {
    const key = row.voucher || `(blank-${index})`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  });

  const vouchers: ImportVoucher[] = [];
  for (const key of order) {
    const blocks = splitWhenBalanced(groups.get(key)!);
    const reused = blocks.length > 1 && !key.startsWith("(blank");
    blocks.forEach((group, blockIndex) => {
      const issues: ImportIssue[] = [];
      const dates = [...new Set(group.map((row) => row.date?.iso).filter(Boolean))] as string[];
      if (!key || key.startsWith("(blank")) {
        issues.push({ level: "error", code: "missing-voucher", message: "A journal line has no voucher number." });
      }
      if (reused) {
        issues.push({
          level: "error",
          code: "duplicate-voucher",
          message: `${key} is reused for ${blocks.length} separate balanced entries. Split them into distinct voucher numbers before posting.`,
        });
      }
      if (dates.length > 1) {
        issues.push({
          level: "warn",
          code: "multi-date",
          message: `${key} spans more than one date (${dates.join(", ")}).`,
        });
      }
      const lines: ImportLine[] = [];
      for (const row of group) {
        if (!row.account) {
          issues.push({ level: "error", code: "missing-account", message: `${key} has a line with no account name.` });
          continue;
        }
        if (row.amount === null) {
          issues.push({ level: "error", code: "bad-amount", message: `${key} / ${row.account} has an unreadable amount.` });
          continue;
        }
        const cols = signedToColumns(row.amount);
        lines.push({
          accountName: row.account,
          description: row.description,
          debit: cols.debit,
          credit: cols.credit,
          rawDate: row.date?.raw,
        });
      }
      const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
      const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
      if (lines.length > 0 && !balanced(debit, credit)) {
        issues.push({
          level: "error",
          code: "unbalanced",
          message: `${key} is out of balance (debit ${debit.toFixed(2)}, credit ${credit.toFixed(2)}).`,
        });
      }
      if (lines.length < 2 && lines.length > 0) {
        issues.push({ level: "error", code: "single-line", message: `${key} has only one line.` });
      }
      vouchers.push({
        voucherNumber: key.startsWith("(blank") ? "" : key,
        date: dates[0] ?? "",
        lines,
        issues,
        blockIndex,
      });
    });
  }
  return vouchers;
}

function splitWhenBalanced(rows: RawJournalRow[]): RawJournalRow[][] {
  const blocks: RawJournalRow[][] = [];
  let current: RawJournalRow[] = [];
  let debit = 0;
  let credit = 0;
  for (const row of rows) {
    current.push(row);
    if (row.amount !== null) {
      if (row.amount >= 0) debit = round2(debit + row.amount);
      else credit = round2(credit + -row.amount);
    }
    if (current.length >= 2 && Math.abs(debit - credit) < 0.005) {
      blocks.push(current);
      current = [];
      debit = 0;
      credit = 0;
    }
  }
  if (current.length) blocks.push(current);
  return blocks.length ? blocks : [rows];
}

function sheetScore(name: string): number {
  const n = name.toLowerCase();
  if (/journal/.test(n)) return 3;
  if (/trial/.test(n)) return 1;
  return 0;
}

export function parseMatrix(fileName: string, sheetNames: string[], matrix: unknown[][]): ImportResult {
  const fileIssues: ImportIssue[] = [];
  const vouchers = groupVouchers(rowsFromMatrix(matrix));
  if (vouchers.length === 0) {
    fileIssues.push({
      level: "error",
      code: "empty",
      message: "No journal rows found. Expected date, voucher, account name, description, and a signed amount.",
    });
  }
  return { fileName, sheetNames, vouchers, issues: fileIssues, source: "journal" };
}

export function parseWorkbook(fileName: string, data: ArrayBuffer): ImportResult {
  const book = XLSX.read(data, { type: "array", cellDates: false });
  const ranked = [...book.SheetNames].sort((a, b) => sheetScore(b) - sheetScore(a));
  const chosen = ranked.find((name) => sheetScore(name) > 0) ?? ranked[0];
  if (!chosen) {
    return {
      fileName,
      sheetNames: [],
      vouchers: [],
      issues: [{ level: "error", code: "empty", message: "The workbook has no sheets." }],
      source: "none",
    };
  }
  const sheet = book.Sheets[chosen];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  const result = parseMatrix(fileName, book.SheetNames, matrix);
  if (sheetScore(chosen) === 0) {
    result.issues.unshift({
      level: "warn",
      code: "sheet-guess",
      message: `No sheet named like a journal. Read “${chosen}” as date / voucher / account / description / signed amount.`,
    });
  }
  const fuzzy = book.SheetNames.filter((name) => /imcome|labilities|curent/i.test(name));
  if (fuzzy.length) {
    result.issues.push({
      level: "warn",
      code: "typo-sheet",
      message: `Sheet name looks misspelled (${fuzzy.join(", ")}). Mapping is by meaning, not exact spelling.`,
    });
  }
  return result;
}

export function parseCsv(fileName: string, text: string): ImportResult {
  const book = XLSX.read(text, { type: "string" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  const result = parseMatrix(fileName, ["csv"], matrix);
  result.source = "csv";
  return result;
}

export const SAMPLE_CSV = `date,voucher,account,description,amount
45748,JV2025040101,Share capital,Issue of shares,-10000
45748,JV2025040101,Cash at bank,Cash subscribed,10000
45748,JV2025040101,Rental income,April rent recognised,-12000
45748,JV2025040101,Rental received in advance,Released from advance,12000
46183,JV2025100601,Sales,Invoice 10 Jun,-9000
46185,JV2025100601,Accounts receivable,Same voucher dated 12 Jun,9000
2025-06-30,JV-BROKEN,Purchases,Unbalanced on purpose,100
2025-06-30,JV-BROKEN,Cash at bank,Only part of the entry,-40
`;
