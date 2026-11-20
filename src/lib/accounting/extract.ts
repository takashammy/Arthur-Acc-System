export interface InvoiceRead {
  party: string | null;
  date: string | null;
  amount: number | null;
  note: string;
}

function isoDate(value: string): string | null {
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (!dmy) return null;
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

/** Pull a supplier, a date, and a total out of invoice text, including text read from a photo. */
export function readInvoiceText(raw: string): InvoiceRead {
  const cleaned = raw.replace(/\r/g, "").trim();
  const partyLine = cleaned.match(/(?:supplier|vendor|from|bill from|billed by|pay to)\s*[:\-]\s*(.+)/i);
  const party = partyLine?.[1]?.split(/\n/)[0]?.replace(/[|]/g, "").trim() || firstName(cleaned);
  const amount = readAmount(cleaned);
  const date = isoDate(cleaned) ?? readLooseDate(cleaned);
  const missing = [
    party ? null : "supplier",
    date ? null : "date",
    amount && Number.isFinite(amount) ? null : "total",
  ].filter(Boolean);
  return {
    party,
    date,
    amount: amount && Number.isFinite(amount) ? amount : null,
    note: missing.length ? `Could not extract the ${missing.join(", ")}. Amend before posting.` : "Confirm the supplier, date, and amount before posting.",
  };
}

function firstName(raw: string): string | null {
  const skip = /^(invoice|bill|date|total|amount|tax|qty|description|item)\b/i;
  for (const line of raw.split("\n")) {
    const value = line.replace(/[^A-Za-z0-9 .,&'-]/g, " ").replace(/\s+/g, " ").trim();
    if (value.length < 4 || value.length > 60 || skip.test(value) || !/[A-Za-z]/.test(value)) continue;
    if (/\d{4}/.test(value) || /HKD|HK\$|\$/.test(value)) continue;
    return value;
  }
  return null;
}

function readAmount(raw: string): number | null {
  const labelled = raw.match(/(?:invoice total|amount due|grand total|total due|total)\s*[:\-]?\s*(?:HKD|HK\$|\$)?\s*([\d,]+(?:\.\d{2})?)/i);
  if (labelled) return Number(labelled[1].replace(/,/g, ""));
  const money = [...raw.matchAll(/(?:HKD|HK\$|\$)\s*([\d,]+(?:\.\d{2})?)/gi)];
  const last = money.at(-1);
  return last ? Number(last[1].replace(/,/g, "")) : null;
}

function readLooseDate(raw: string): string | null {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const named = raw.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (!named) return null;
  return `${named[3]}-${months[named[2].slice(0, 3).toLowerCase()]}-${named[1].padStart(2, "0")}`;
}
