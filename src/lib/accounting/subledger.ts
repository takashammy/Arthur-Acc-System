import { round2 } from "./money";

export type InvoiceKind = "receivable" | "payable";
export type AssetCategory = "building" | "plant";

export interface Invoice {
  id: string;
  entityId: string;
  kind: InvoiceKind;
  party: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
}

export interface Settlement {
  id: string;
  invoiceId: string;
  settledOn: string;
  amount: number;
  journalId: string | null;
}

export interface FixedAsset {
  id: string;
  entityId: string;
  name: string;
  category: AssetCategory;
  acquired: string;
  cost: number;
  disposed: string | null;
  proceeds: number;
  taxWdv: number | null;
}

export interface AssetWork {
  asset: FixedAsset;
  depreciation: number;
  allowance: number;
  nbv: number;
  note: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "31 Mar 2026" -> 2026-03-31. Falls back to 31 March of the current label year. */
export function yearEndIso(label: string): string {
  const match = label.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return "2026-03-31";
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[2].slice(0, 3).toLowerCase());
  const day = match[1].padStart(2, "0");
  const mm = String(month + 1).padStart(2, "0");
  return `${match[3]}-${mm}-${day}`;
}

export function shiftIso(iso: string, years: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function nextYearEndLabel(label: string): string {
  return label.replace(/\d{4}/, (year) => String(Number(year) + 1));
}

export function yearStartIso(yearEnd: string): string {
  const end = new Date(`${yearEnd}T00:00:00Z`);
  end.setUTCFullYear(end.getUTCFullYear() - 1);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}

export function outstanding(invoice: Invoice, settlements: Settlement[], asOf?: string): number {
  const paid = settlements
    .filter((item) => item.invoiceId === invoice.id && (!asOf || item.settledOn <= asOf))
    .reduce((sum, item) => sum + item.amount, 0);
  return round2(Math.max(0, invoice.amount - paid));
}

export function ageBucket(days: number): string {
  if (days <= 30) return "0–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "Over 90";
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Age open invoices from the invoice date to the year end. Amounts are positive. */
export function ageInvoices(
  invoices: Invoice[],
  settlements: Settlement[],
  kind: InvoiceKind,
  asOf: string,
): [string, number][] {
  const groups = new Map<string, number>();
  for (const invoice of invoices.filter((item) => item.kind === kind && item.invoiceDate <= asOf)) {
    const open = outstanding(invoice, settlements, asOf);
    if (open < 0.005) continue;
    const name = ageBucket(daysBetween(invoice.invoiceDate, asOf));
    groups.set(name, round2((groups.get(name) ?? 0) + open));
  }
  return [...groups.entries()];
}

/** Open invoices in one ageing bucket, measured from the invoice date. */
export function invoicesInBucket(
  invoices: Invoice[],
  settlements: Settlement[],
  kind: InvoiceKind,
  asOf: string,
  bucket: string,
): Invoice[] {
  return invoices.filter((invoice) => {
    if (invoice.kind !== kind || invoice.invoiceDate > asOf) return false;
    if (outstanding(invoice, settlements, asOf) < 0.005) return false;
    return ageBucket(daysBetween(invoice.invoiceDate, asOf)) === bucket;
  });
}

export function openTotal(invoices: Invoice[], settlements: Settlement[], kind: InvoiceKind, asOf: string): number {
  return round2(
    invoices
      .filter((item) => item.kind === kind && item.invoiceDate <= asOf)
      .reduce((sum, invoice) => sum + outstanding(invoice, settlements, asOf), 0),
  );
}

function heldAt(asset: FixedAsset, asOf: string): boolean {
  return asset.acquired <= asOf && (!asset.disposed || asset.disposed > asOf);
}

function disposedInYear(asset: FixedAsset, start: string, end: string): boolean {
  return Boolean(asset.disposed && asset.disposed >= start && asset.disposed <= end);
}

/** Accounting depreciation and the Hong Kong capital allowance for one year. */
export function workAssets(assets: FixedAsset[], yearEndLabel: string): AssetWork[] {
  const end = yearEndIso(yearEndLabel);
  const start = yearStartIso(end);
  return assets.map((asset) => {
    if (disposedInYear(asset, start, end)) {
      return {
        asset,
        depreciation: 0,
        allowance: 0,
        nbv: 0,
        note: "Disposed this year. The balancing allowance or charge is not computed here.",
      };
    }
    if (!heldAt(asset, end)) {
      return { asset, depreciation: 0, allowance: 0, nbv: round2(asset.cost), note: "Not held at the year end." };
    }
    if (asset.category === "building") {
      const charge = round2(asset.cost * 0.04);
      return {
        asset,
        depreciation: charge,
        allowance: charge,
        nbv: round2(asset.cost - charge),
        note: "Commercial building allowance, 4% of cost. Book depreciation uses the same 4%.",
      };
    }
    const depreciation = round2(asset.cost * 0.2);
    const nbv = round2(asset.cost - depreciation);
    if (asset.acquired >= start) {
      const initial = round2(asset.cost * 0.6);
      const annual = round2((asset.cost - initial) * 0.2);
      return {
        asset,
        depreciation,
        allowance: round2(initial + annual),
        nbv,
        note: "Plant bought this year: 60% initial allowance and 20% annual allowance. Book depreciation is 20% straight line.",
      };
    }
    if (asset.taxWdv == null) {
      return {
        asset,
        depreciation,
        allowance: 0,
        nbv,
        note: "Bought before this year. Enter the opening tax written-down value before claiming the annual allowance.",
      };
    }
    const allowance = round2(asset.taxWdv * 0.2);
    return {
      asset,
      depreciation,
      allowance,
      nbv,
      note: "Plant held from an earlier year: 20% annual allowance on the opening tax written-down value. Book depreciation is 20% straight line.",
    };
  });
}
