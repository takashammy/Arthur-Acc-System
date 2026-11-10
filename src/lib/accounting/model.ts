import { balanced, round2 } from "./money";

export type AccountType =
  | "asset"
  | "contra_asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type PeriodStatus = "open" | "locked";

export interface Entity {
  id: string;
  name: string;
  crNumber: string;
  currency: "HKD";
  yearEnd: string;
}

export interface Period {
  entityId: string;
  label: string;
  status: PeriodStatus;
}

export type CashFlowClass = "cash" | "operating" | "investing" | "financing" | "noncash" | "profit";

export interface Account {
  id: string;
  entityId: string;
  code: string;
  name: string;
  type: AccountType;
  flow?: CashFlowClass;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface Journal {
  id: string;
  entityId: string;
  voucherNumber: string;
  date: string;
  reason: string;
  status: "posted";
  lines: JournalLine[];
}

export interface DraftLine {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

let seq = 1;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

function line(
  accountId: string,
  debit: number,
  credit: number,
  description: string,
): JournalLine {
  return { id: uid("ln"), accountId, debit, credit, description };
}

function journal(
  entityId: string,
  voucherNumber: string,
  date: string,
  reason: string,
  lines: JournalLine[],
): Journal {
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (!balanced(debit, credit)) {
    throw new Error(`Fixture ${voucherNumber} does not balance (${debit} vs ${credit})`);
  }
  return {
    id: uid("jv"),
    entityId,
    voucherNumber,
    date,
    reason,
    status: "posted",
    lines,
  };
}

const TRADE = "ent_trade";
const RENTAL = "ent_rental";

function acc(
  entityId: string,
  code: string,
  name: string,
  type: AccountType,
  flow: CashFlowClass,
): Account {
  return { id: `${entityId}_${code}`, entityId, code, name, type, flow };
}

export const ENTITIES: Entity[] = [
  {
    id: TRADE,
    name: "Harbour Trade Limited",
    crNumber: "3128456",
    currency: "HKD",
    yearEnd: "31 Mar 2026",
  },
  {
    id: RENTAL,
    name: "Harbour Rental Limited",
    crNumber: "3189021",
    currency: "HKD",
    yearEnd: "31 Mar 2026",
  },
];

export const PERIODS: Period[] = [
  { entityId: TRADE, label: "FY2026", status: "open" },
  { entityId: RENTAL, label: "FY2026", status: "open" },
];

const tradeAccounts: Account[] = [
  acc(TRADE, "1000", "Cash at bank", "asset", "cash"),
  acc(TRADE, "1100", "Accounts receivable", "asset", "operating"),
  acc(TRADE, "1200", "Inventory", "asset", "operating"),
  acc(TRADE, "1300", "Due from shareholder", "asset", "financing"),
  acc(TRADE, "2000", "Accounts payable", "liability", "operating"),
  acc(TRADE, "2100", "Due to director", "liability", "financing"),
  acc(TRADE, "3000", "Share capital", "equity", "financing"),
  acc(TRADE, "4000", "Sales", "revenue", "profit"),
  acc(TRADE, "5000", "Purchases", "expense", "profit"),
];

const rentalAccounts: Account[] = [
  acc(RENTAL, "1000", "Cash at bank", "asset", "cash"),
  acc(RENTAL, "1500", "Property, plant and equipment", "asset", "investing"),
  acc(RENTAL, "1510", "Accumulated depreciation", "contra_asset", "noncash"),
  acc(RENTAL, "2100", "Due to director", "liability", "financing"),
  acc(RENTAL, "2300", "Rental received in advance", "liability", "operating"),
  acc(RENTAL, "4100", "Rental income", "revenue", "profit"),
  acc(RENTAL, "6100", "Depreciation", "expense", "noncash"),
];

export const SEED_ACCOUNTS: Account[] = [...tradeAccounts, ...rentalAccounts];

const t = (code: string) => `${TRADE}_${code}`;
const r = (code: string) => `${RENTAL}_${code}`;

export const SEED_JOURNALS: Journal[] = [
  journal(TRADE, "JV2025040101", "2025-04-01", "Issue of share capital", [
    line(t("1000"), 10000, 0, "Cash subscribed"),
    line(t("3000"), 0, 10000, "Ordinary shares"),
  ]),
  journal(TRADE, "JV2025040102", "2025-04-01", "Director's advance", [
    line(t("1000"), 1000000, 0, "Funds received"),
    line(t("2100"), 0, 1000000, "Due to director"),
  ]),
  journal(TRADE, "JV2025040201", "2025-04-02", "Advance to shareholder", [
    line(t("1300"), 10000, 0, "Amount due from shareholder"),
    line(t("1000"), 0, 10000, "Cash paid"),
  ]),
  journal(TRADE, "JV2025061001", "2025-06-10", "Sales for the period", [
    line(t("1100"), 9000, 0, "Trade receivables"),
    line(t("1000"), 9999.66, 0, "Cash sales"),
    line(t("4000"), 0, 18999.66, "Sales"),
  ]),
  journal(TRADE, "JV2025061201", "2025-06-12", "Purchases and inventory", [
    line(t("1200"), 4000, 0, "Goods held for resale"),
    line(t("5000"), 12633.32, 0, "Purchases"),
    line(t("2000"), 0, 10000, "Trade payables"),
    line(t("1000"), 0, 6633.32, "Cash paid to suppliers"),
  ]),
  journal(RENTAL, "JV2025040101", "2025-04-01", "Acquisition of property", [
    line(r("1500"), 5000000, 0, "Leasehold property at cost"),
    line(r("2100"), 0, 5000000, "Funded by director"),
  ]),
  journal(RENTAL, "JV2025040102", "2025-04-01", "Director working-capital advance", [
    line(r("1000"), 1000000, 0, "Cash received"),
    line(r("2100"), 0, 1000000, "Due to director"),
  ]),
  journal(RENTAL, "JV2025040103", "2025-04-01", "Rental received in advance", [
    line(r("1000"), 288000, 0, "24 months received"),
    line(r("2300"), 0, 288000, "Contract liability"),
  ]),
  journal(RENTAL, "JV2026033101", "2026-03-31", "Recognise rental income for the year", [
    line(r("2300"), 144000, 0, "12 months earned"),
    line(r("4100"), 0, 144000, "Rental income"),
  ]),
  journal(RENTAL, "JV2026033102", "2026-03-31", "Depreciation for the year", [
    line(r("6100"), 200000, 0, "Straight line"),
    line(r("1510"), 0, 200000, "Accumulated depreciation"),
  ]),
];

export interface TbRow {
  account: Account;
  debit: number;
  credit: number;
  balance: number;
}

export function trialBalance(accounts: Account[], journals: Journal[], entityId: string): TbRow[] {
  const rows = new Map<string, TbRow>();
  for (const account of accounts.filter((a) => a.entityId === entityId)) {
    rows.set(account.id, { account, debit: 0, credit: 0, balance: 0 });
  }
  for (const journalEntry of journals.filter((j) => j.entityId === entityId && j.status === "posted")) {
    for (const entry of journalEntry.lines) {
      const row = rows.get(entry.accountId);
      if (!row) continue;
      row.debit = round2(row.debit + entry.debit);
      row.credit = round2(row.credit + entry.credit);
    }
  }
  for (const row of rows.values()) {
    row.balance = round2(row.debit - row.credit);
  }
  return [...rows.values()]
    .filter((row) => row.debit !== 0 || row.credit !== 0)
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
}

export function tbTotals(rows: TbRow[]) {
  return {
    debit: round2(rows.reduce((s, r) => s + r.debit, 0)),
    credit: round2(rows.reduce((s, r) => s + r.credit, 0)),
  };
}

const NATURAL_CREDIT = new Set<AccountType>(["liability", "equity", "revenue"]);

export function signedBalance(account: Account, balance: number): number {
  if (account.type === "expense") return round2(-balance);
  if (account.type === "contra_asset") return balance;
  return NATURAL_CREDIT.has(account.type) ? round2(-balance) : balance;
}

export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}

export interface Statements {
  income: StatementLine[];
  incomeTotal: number;
  assets: StatementLine[];
  assetTotal: number;
  liabilities: StatementLine[];
  liabilityTotal: number;
  equity: StatementLine[];
  equityTotal: number;
  netAssets: number;
  balanced: boolean;
}

export function statements(rows: TbRow[]): Statements {
  const pick = (types: AccountType[]) =>
    rows
      .filter((row) => types.includes(row.account.type) && row.balance !== 0)
      .map((row) => ({
        code: row.account.code,
        name: row.account.name,
        amount: signedBalance(row.account, row.balance),
      }));

  const sum = (lines: StatementLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));
  const income = [...pick(["revenue"]), ...pick(["expense"])];
  const assets = [...pick(["asset"]), ...pick(["contra_asset"])];
  const liabilities = pick(["liability"]);
  const profit = sum(income);
  const equityAccounts = pick(["equity"]);
  const equity = [
    ...equityAccounts,
    { code: "3900", name: "Current-year result", amount: profit },
  ].filter((line) => line.amount !== 0);
  const assetTotal = sum(assets);
  const liabilityTotal = sum(liabilities);
  const equityTotal = sum(equity);
  const netAssets = round2(assetTotal - liabilityTotal);
  return {
    income,
    incomeTotal: profit,
    assets,
    assetTotal,
    liabilities,
    liabilityTotal,
    equity,
    equityTotal,
    netAssets,
    balanced: Math.abs(netAssets - equityTotal) < 0.02,
  };
}

export function accountFlow(account: Account): CashFlowClass {
  if (account.flow) return account.flow;
  const name = account.name.toLowerCase();
  if (account.code === "1000" || /cash/.test(name)) return "cash";
  if (account.type === "contra_asset" || /accumulat/.test(name)) return "noncash";
  if (account.type === "expense" && /depreciat/.test(name)) return "noncash";
  if (/property|plant|equipment/.test(name) || account.code.startsWith("15")) return "investing";
  if (account.type === "equity" || /due to|due from|share capital|director|shareholder/.test(name)) return "financing";
  if (account.type === "revenue" || account.type === "expense") return "profit";
  return "operating";
}

export interface CashFlowStatement {
  profit: number;
  operating: StatementLine[];
  operatingTotal: number;
  investing: StatementLine[];
  investingTotal: number;
  financing: StatementLine[];
  financingTotal: number;
  net: number;
  cashMovement: number;
  ties: boolean;
}

export function cashFlow(rows: TbRow[], profit: number): CashFlowStatement {
  const section = (flow: CashFlowClass, labelFor?: (row: TbRow) => string) =>
    rows
      .filter((row) => accountFlow(row.account) === flow && row.balance !== 0)
      .filter((row) => !(flow === "noncash" && row.account.type === "contra_asset"))
      .map((row) => {
        const amount =
          flow === "noncash" && row.account.type === "expense"
            ? round2(-signedBalance(row.account, row.balance))
            : round2(-row.balance);
        return {
          code: row.account.code,
          name:
            flow === "noncash" && row.account.type === "expense"
              ? `${row.account.name} added back`
              : row.account.name,
          amount,
        };
      })
      .filter((line) => line.amount !== 0);

  const operating = section("noncash").concat(section("operating"));
  const investing = section("investing");
  const financing = section("financing");
  const sum = (lines: StatementLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));
  const operatingTotal = round2(profit + sum(operating));
  const investingTotal = sum(investing);
  const financingTotal = sum(financing);
  const net = round2(operatingTotal + investingTotal + financingTotal);
  const cashMovement = round2(
    rows.filter((row) => accountFlow(row.account) === "cash").reduce((s, row) => s + row.balance, 0),
  );
  return {
    profit,
    operating,
    operatingTotal,
    investing,
    investingTotal,
    financing,
    financingTotal,
    net,
    cashMovement,
    ties: Math.abs(net - cashMovement) < 0.02,
  };
}

export function assertPostable(input: {
  period: Period | undefined;
  voucherNumber: string;
  existing: Journal[];
  entityId: string;
  lines: { accountId: string; debit: number; credit: number }[];
}): string | null {
  if (!input.period) return "No open period for this entity.";
  if (input.period.status !== "open") return "This period is locked. Corrections must be reversing entries in an open period.";
  const voucher = input.voucherNumber.trim();
  if (!voucher) return "Voucher number is required.";
  if (input.existing.some((j) => j.entityId === input.entityId && j.voucherNumber === voucher)) {
    return `Voucher ${voucher} already exists for this entity.`;
  }
  if (input.lines.length < 2) return "A journal needs at least two lines.";
  let debit = 0;
  let credit = 0;
  for (const entry of input.lines) {
    if (!entry.accountId) return "Every line needs an account.";
    if (entry.debit < 0 || entry.credit < 0) return "Debit and credit must be zero or positive.";
    if (entry.debit > 0 && entry.credit > 0) return "A line cannot carry both a debit and a credit.";
    if (entry.debit === 0 && entry.credit === 0) return "Remove empty lines before posting.";
    debit += entry.debit;
    credit += entry.credit;
  }
  if (!balanced(debit, credit)) {
    return `Out of balance by ${round2(Math.abs(debit - credit)).toFixed(2)}.`;
  }
  return null;
}
