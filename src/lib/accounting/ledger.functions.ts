import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import {
  accountFlow,
  assertPostable,
  ENTITIES,
  PERIODS,
  SEED_ACCOUNTS,
  SEED_JOURNALS,
  trialBalance,
  tbTotals,
  statements,
  uid,
  guessAccountType,
  type Account,
  type AccountType,
  type CashFlowClass,
  type Entity,
  type Journal,
  type Period,
  type PeriodStatus,
} from "./model";
import { round2 } from "./money";
import { leasePresentValue } from "./lease";
import { outstanding, type FixedAsset, type Invoice, type InvoiceKind, type Settlement } from "./subledger";
import type { ImportVoucher } from "./excel";

export interface TaxAdjustment {
  id: string;
  entityId: string;
  label: string;
  amount: number;
  kind: "add" | "deduct" | "loss_bf";
}

export interface PaperThread {
  at: string;
  role: string;
  text: string;
}

export interface EntityPaper {
  entityId: string;
  notes: Record<string, string>;
  bankRules: string[];
  csvMap: { date: number; description: number; amount: number; debit: number; credit: number } | null;
  agmDate: string;
  resolutionDrafted: boolean;
  material: number;
  waivers: string[];
  taxReviewed: boolean;
  allowanceNote: string;
  seenAt: string;
  thread: PaperThread[];
  partyNotes: Record<string, string>;
  reportLocked: boolean;
  importMap: Record<string, string>;
}

export type FirmRole = "partner" | "reviewer" | "preparer";

export interface AuditEvent {
  id: string;
  entityId: string | null;
  action: string;
  detail: string;
  createdAt: string;
}

export interface BankLine {
  id: string;
  entityId: string;
  date: string;
  description: string;
  amount: number;
  matchedJournalId: string | null;
}

export interface EvidenceLink {
  id: string;
  documentId: string;
  journalId: string;
}

export interface DocumentFile {
  id: string;
  entityId: string;
  filename: string;
  mime: string;
  createdAt: string;
}

export interface Officer {
  id: string;
  entityId: string;
  role: "director" | "shareholder" | "secretary";
  name: string;
  detail: string;
  appointed: string;
}

export type ReviewStatus = "draft" | "submitted" | "returned" | "reviewed" | "signed" | "released";

export interface Review {
  entityId: string;
  status: ReviewStatus;
  note: string;
}

export interface ClientRequest {
  id: string;
  entityId: string;
  title: string;
  detail: string;
  status: "open" | "received";
}

export interface Employee {
  id: string;
  entityId: string;
  name: string;
  monthlyPay: number;
}

export interface PaySlip {
  id: string;
  entityId: string;
  employeeId: string;
  paidOn: string;
  gross: number;
  employeeMpf: number;
  employerMpf: number;
  net: number;
}

export interface StockItem {
  id: string;
  entityId: string;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface Lease {
  id: string;
  entityId: string;
  name: string;
  started: string;
  months: number;
  payment: number;
  annualRate: number;
  cost: number;
  liability: number;
  postedMonths: number;
}

export interface EliminationRow {
  id: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  reason: string;
  eliminatedOn: string;
}

export interface LedgerSnapshot {
  firmName: string;
  role: FirmRole;
  entities: Entity[];
  periods: Period[];
  accounts: Account[];
  journals: Journal[];
  audit: AuditEvent[];
  bankLines: BankLine[];
  documents: DocumentFile[];
  links: EvidenceLink[];
  officers: Officer[];
  invoices: Invoice[];
  settlements: Settlement[];
  assets: FixedAsset[];
  reviews: Review[];
  requests: ClientRequest[];
  employees: Employee[];
  paySlips: PaySlip[];
  stock: StockItem[];
  leases: Lease[];
  eliminations: EliminationRow[];
  taxAdjustments: TaxAdjustment[];
  papers: EntityPaper[];
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function emptyPaper(entityId: string): EntityPaper {
  return {
    entityId,
    notes: {},
    bankRules: [],
    csvMap: null,
    agmDate: "",
    resolutionDrafted: false,
    material: 10000,
    waivers: [],
    taxReviewed: false,
    allowanceNote: "",
    seenAt: "",
    thread: [],
    partyNotes: {},
    reportLocked: false,
    importMap: {},
  };
}

export function parsePaper(entityId: string, payload: string): EntityPaper {
  const empty = emptyPaper(entityId);
  try {
    const raw = JSON.parse(payload) as Partial<EntityPaper>;
    const map = raw.csvMap;
    const csvMap =
      map && typeof map.date === "number" && typeof map.description === "number" && typeof map.amount === "number"
        ? {
            date: map.date,
            description: map.description,
            amount: map.amount,
            debit: typeof map.debit === "number" ? map.debit : -1,
            credit: typeof map.credit === "number" ? map.credit : -1,
          }
        : null;
    const thread = Array.isArray(raw.thread)
      ? raw.thread
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const row = item as Partial<PaperThread>;
            return {
              at: typeof row.at === "string" ? row.at : "",
              role: typeof row.role === "string" ? row.role : "",
              text: typeof row.text === "string" ? row.text : "",
            };
          })
          .filter((item) => item.text)
      : [];
    const partyNotes =
      raw.partyNotes && typeof raw.partyNotes === "object"
        ? Object.fromEntries(Object.entries(raw.partyNotes).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
    const importMap =
      raw.importMap && typeof raw.importMap === "object"
        ? Object.fromEntries(Object.entries(raw.importMap).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
    return {
      entityId,
      notes: raw.notes && typeof raw.notes === "object" ? raw.notes : {},
      bankRules: Array.isArray(raw.bankRules) ? raw.bankRules.filter((item) => typeof item === "string") : [],
      csvMap,
      agmDate: typeof raw.agmDate === "string" ? raw.agmDate : "",
      resolutionDrafted: Boolean(raw.resolutionDrafted),
      material: typeof raw.material === "number" && raw.material >= 0 ? raw.material : 10000,
      waivers: Array.isArray(raw.waivers) ? raw.waivers.filter((item) => typeof item === "string") : [],
      taxReviewed: Boolean(raw.taxReviewed),
      allowanceNote: typeof raw.allowanceNote === "string" ? raw.allowanceNote : "",
      seenAt: typeof raw.seenAt === "string" ? raw.seenAt : "",
      thread,
      partyNotes,
      reportLocked: Boolean(raw.reportLocked),
      importMap,
    };
  } catch {
    return empty;
  }
}

function asType(value: string): AccountType {
  return value as AccountType;
}

function asFlow(value: string | null): CashFlowClass | undefined {
  return (value ?? undefined) as CashFlowClass | undefined;
}

async function seedBooks(sql: Sql, firmId: string) {
  const entityIds = new Map<string, string>();
  for (const entity of ENTITIES) {
    const id = uid("ent");
    entityIds.set(entity.id, id);
    await sql`insert into entities (id, name, cr_number, currency, year_end, firm_id)
      values (${id}, ${entity.name}, ${entity.crNumber}, ${entity.currency}, ${entity.yearEnd}, ${firmId})`;
  }
  for (const period of PERIODS) {
    const entityId = entityIds.get(period.entityId);
    if (!entityId) continue;
    await sql`insert into periods (entity_id, label, status) values (${entityId}, ${period.label}, ${period.status})`;
  }
  const accountIds = new Map<string, string>();
  for (const account of SEED_ACCOUNTS) {
    const id = uid("ac");
    const entityId = entityIds.get(account.entityId);
    if (!entityId) continue;
    accountIds.set(account.id, id);
    await sql`insert into accounts (id, entity_id, code, name, type, flow)
      values (${id}, ${entityId}, ${account.code}, ${account.name}, ${account.type}, ${account.flow ?? null})`;
  }
  for (const entry of SEED_JOURNALS) {
    const id = uid("jv");
    const entityId = entityIds.get(entry.entityId);
    if (!entityId) continue;
    await sql`insert into journals (id, entity_id, voucher_number, journal_date, reason, status)
      values (${id}, ${entityId}, ${entry.voucherNumber}, ${entry.date}, ${entry.reason}, ${entry.status})`;
    for (const [index, line] of entry.lines.entries()) {
      const accountId = accountIds.get(line.accountId);
      if (!accountId) continue;
      await sql`insert into journal_lines (id, journal_id, account_id, debit, credit, description, line_no)
        values (${uid("ln")}, ${id}, ${accountId}, ${line.debit}, ${line.credit}, ${line.description}, ${index})`;
    }
  }
  const firstEntity = entityIds.values().next().value ?? null;
  await sql`insert into audit_events (id, entity_id, action, detail)
    values (${uid("au")}, ${firstEntity}, 'seed', 'Opened Arthur Practice with the Harbour sample books')`;
}

export async function practice(sql: Sql): Promise<{ firmId: string; firmName: string; role: FirmRole }> {
  const rows = await sql<{ id: string; name: string; acting_role: string | null }>`select id, name, acting_role from firms order by created_at limit 1`;
  const found = rows[0];
  if (found) {
    const role = found.acting_role === "reviewer" || found.acting_role === "preparer" ? found.acting_role : "partner";
    return { firmId: found.id, firmName: found.name, role };
  }
  const firmId = uid("firm");
  await sql`insert into firms (id, name) values (${firmId}, 'Arthur Practice')`;
  await seedBooks(sql, firmId);
  return { firmId, firmName: "Arthur Practice", role: "partner" };
}

const SAMPLE_COMPANIES = new Set(["Harbour Trade Limited", "Harbour Rental Limited"]);

async function repairBrokenJournals(sql: Sql) {
  const bad = await sql<{ id: string }>`
    select j.id
    from journals j
    left join journal_lines l on l.journal_id = j.id
    group by j.id
    having count(l.id) < 2
       or abs(coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0)) > 0.02
  `;
  for (const row of bad) {
    await sql`delete from evidence_links where journal_id = ${row.id}`;
    await sql`update invoice_settlements set journal_id = null where journal_id = ${row.id}`;
    await sql`update bank_lines set matched_journal_id = null where matched_journal_id = ${row.id}`;
    await sql`delete from journal_lines where journal_id = ${row.id}`;
    await sql`delete from journals where id = ${row.id}`;
  }
}

async function ensureRegisters(sql: Sql, firmId: string) {
  await repairBrokenJournals(sql);
  const entities = await sql<{ id: string; name: string }>`select id, name from entities where firm_id = ${firmId}`;
  for (const entity of entities) {
    const sample = SAMPLE_COMPANIES.has(entity.name);
    if (sample) {
      await sql`update entities set incorporated = '2024-04-01' where id = ${entity.id} and incorporated is null`;
      await sql`update entities
        set registered_office = '12/F, Harbour House, 1 Connaught Road Central, Hong Kong'
        where id = ${entity.id} and coalesce(registered_office, '') = ''`;
    } else {
      await sql`delete from company_officers where entity_id = ${entity.id}`;
      await sql`delete from client_requests where entity_id = ${entity.id}
        and title in ('June sales invoices', 'Bank statements for the year', 'Tenancy agreement', 'Rates and government rent')`;
      await sql`delete from employees where entity_id = ${entity.id} and name in ('Alex Chan', 'Mei Wong')`;
      await sql`delete from stock_items where entity_id = ${entity.id} and sku = 'TEA-1'`;
      await sql`delete from leases where entity_id = ${entity.id} and name = 'Kwun Tong office'`;
      await sql`update entities set registered_office = null
        where id = ${entity.id} and registered_office = '12/F, Harbour House, 1 Connaught Road Central, Hong Kong'`;
    }
    const [{ r }] = await sql<{ r: number }>`select count(*)::int as r from reviews where entity_id = ${entity.id}`;
    if (r === 0) {
      await sql`insert into reviews (entity_id, status, note) values (${entity.id}, 'draft', '')`;
    }
    if (!sample) continue;
    const [{ n }] = await sql<{ n: number }>`select count(*)::int as n from company_officers where entity_id = ${entity.id}`;
    if (n === 0) {
      const people = [
        { role: "director", name: "Alex Chan", detail: "Hong Kong" },
        { role: "shareholder", name: "Alex Chan", detail: "10,000 ordinary shares" },
        { role: "secretary", name: "Arthur & Co", detail: "TCSP" },
      ];
      for (const person of people) {
        await sql`insert into company_officers (id, entity_id, role, name, detail, appointed)
          values (${uid("of")}, ${entity.id}, ${person.role}, ${person.name}, ${person.detail}, '2024-04-01')`;
      }
    }
    const [{ invoices }] = await sql<{ invoices: number }>`select count(*)::int as invoices from invoices where entity_id = ${entity.id}`;
    if (invoices === 0 && entity.name === "Harbour Trade Limited") {
      await sql`insert into invoices (id, entity_id, kind, party, invoice_no, invoice_date, due_date, amount)
        values (${uid("inv")}, ${entity.id}, 'receivable', 'Pacific Buyer Ltd', 'INV-1001', '2025-06-10', '2025-07-10', 9000)`;
      await sql`insert into invoices (id, entity_id, kind, party, invoice_no, invoice_date, due_date, amount)
        values (${uid("inv")}, ${entity.id}, 'payable', 'Kowloon Supply Co', 'BILL-2001', '2025-06-12', '2025-07-12', 10000)`;
    }
    const [{ a }] = await sql<{ a: number }>`select count(*)::int as a from fixed_assets where entity_id = ${entity.id}`;
    if (a === 0 && entity.name === "Harbour Rental Limited") {
      await sql`insert into fixed_assets (id, entity_id, name, category, acquired, cost)
        values (${uid("fa")}, ${entity.id}, 'Leasehold property', 'building', '2025-04-01', 5000000)`;
    }
    const [{ q }] = await sql<{ q: number }>`select count(*)::int as q from client_requests where entity_id = ${entity.id}`;
    if (q === 0) {
      const asks =
        entity.name === "Harbour Trade Limited"
          ? [
              ["June sales invoices", "The Pacific Buyer invoice and the cash sales for June."],
              ["Bank statements for the year", "Every HKD account, April 2025 to March 2026."],
            ]
          : [
              ["Tenancy agreement", "The lease for the property on the register."],
              ["Rates and government rent", "Receipts for the year ended 31 March 2026."],
            ];
      for (const [title, detail] of asks) {
        await sql`insert into client_requests (id, entity_id, title, detail, status)
          values (${uid("req")}, ${entity.id}, ${title}, ${detail}, 'open')`;
      }
    }
    if (entity.name !== "Harbour Trade Limited") continue;
    const [{ staff }] = await sql<{ staff: number }>`select count(*)::int as staff from employees where entity_id = ${entity.id}`;
    if (staff === 0) {
      await sql`insert into employees (id, entity_id, name, monthly_pay) values
        (${uid("emp")}, ${entity.id}, 'Alex Chan', 22000),
        (${uid("emp")}, ${entity.id}, 'Mei Wong', 6500)`;
    }
    const [{ items }] = await sql<{ items: number }>`select count(*)::int as items from stock_items where entity_id = ${entity.id}`;
    if (items === 0) {
      await sql`insert into stock_items (id, entity_id, sku, name, qty, unit_cost)
        values (${uid("stk")}, ${entity.id}, 'TEA-1', 'Harbour tea caddy', 0, 80)`;
    }
    const [{ leases }] = await sql<{ leases: number }>`select count(*)::int as leases from leases where entity_id = ${entity.id}`;
    if (leases === 0) {
      const cost = leasePresentValue(8000, 24, 0.05);
      await sql`insert into leases (id, entity_id, name, started, months, payment, annual_rate, cost, liability, posted_months)
        values (${uid("ls")}, ${entity.id}, 'Kwun Tong office', '2025-04-01', 24, 8000, 0.05, ${cost}, ${cost}, -1)`;
    }
  }
}

export async function readSnapshot(sql: Sql, scope: { firmId: string; firmName: string; role: FirmRole }): Promise<LedgerSnapshot> {
  const entities = await sql<{
    id: string;
    name: string;
    cr_number: string;
    currency: "HKD";
    year_end: string;
    incorporated: string | null;
    registered_office: string | null;
  }>`select id, name, cr_number, currency, year_end, incorporated::text as incorporated, registered_office
     from entities where firm_id = ${scope.firmId} order by name`;
  const periods = await sql<{ entity_id: string; label: string; status: PeriodStatus; starts_on: string | null; ends_on: string | null }>`
    select p.entity_id, p.label, p.status, p.starts_on::text as starts_on, p.ends_on::text as ends_on
    from periods p
    join entities e on e.id = p.entity_id
    where e.firm_id = ${scope.firmId}
    order by p.label`;
  const accounts = await sql<{
    id: string;
    entity_id: string;
    code: string;
    name: string;
    type: string;
    flow: string | null;
  }>`select a.id, a.entity_id, a.code, a.name, a.type, a.flow
     from accounts a
     join entities e on e.id = a.entity_id
     where e.firm_id = ${scope.firmId}
     order by a.code`;
  const journals = await sql<{
    id: string;
    entity_id: string;
    voucher_number: string;
    journal_date: string;
    reason: string;
    status: "posted";
  }>`select j.id, j.entity_id, j.voucher_number, j.journal_date::text as journal_date, j.reason, j.status
     from journals j
     join entities e on e.id = j.entity_id
     where e.firm_id = ${scope.firmId}
     order by j.journal_date, j.voucher_number`;
  const lines = await sql<{
    id: string;
    journal_id: string;
    account_id: string;
    debit: string | number;
    credit: string | number;
    description: string;
    line_no: number;
  }>`select l.id, l.journal_id, l.account_id, l.debit, l.credit, l.description, l.line_no
     from journal_lines l
     join journals j on j.id = l.journal_id
     join entities e on e.id = j.entity_id
     where e.firm_id = ${scope.firmId}
     order by l.line_no`;
  const audit = await sql<{
    id: string;
    entity_id: string | null;
    action: string;
    detail: string;
    created_at: string;
  }>`select a.id, a.entity_id, a.action, a.detail, a.created_at::text as created_at
     from audit_events a
     left join entities e on e.id = a.entity_id
     where e.firm_id = ${scope.firmId}
     order by a.created_at desc limit 80`;
  const bank = await sql<{
    id: string;
    entity_id: string;
    line_date: string;
    description: string;
    amount: string | number;
    matched_journal_id: string | null;
  }>`select b.id, b.entity_id, b.line_date::text as line_date, b.description, b.amount, b.matched_journal_id
     from bank_lines b
     join entities e on e.id = b.entity_id
     where e.firm_id = ${scope.firmId}
     order by b.line_date, b.description`;
  const documents = await sql<{
    id: string;
    entity_id: string;
    filename: string;
    mime: string;
    created_at: string;
  }>`select d.id, d.entity_id, d.filename, d.mime, d.created_at::text as created_at
     from documents d
     join entities e on e.id = d.entity_id
     where e.firm_id = ${scope.firmId}
     order by d.created_at desc`;
  const links = await sql<{ id: string; document_id: string; journal_id: string }>`
    select l.id, l.document_id, l.journal_id
    from evidence_links l
    join journals j on j.id = l.journal_id
    join entities e on e.id = j.entity_id
    where e.firm_id = ${scope.firmId}`;
  const officers = await sql<{
    id: string;
    entity_id: string;
    role: Officer["role"];
    name: string;
    detail: string;
    appointed: string;
  }>`select o.id, o.entity_id, o.role, o.name, o.detail, o.appointed::text as appointed
     from company_officers o
     join entities e on e.id = o.entity_id
     where e.firm_id = ${scope.firmId}
     order by o.role, o.name`;
  const invoices = await sql<{
    id: string;
    entity_id: string;
    kind: InvoiceKind;
    party: string;
    invoice_no: string;
    invoice_date: string;
    due_date: string;
    amount: string | number;
  }>`select i.id, i.entity_id, i.kind, i.party, i.invoice_no, i.invoice_date::text as invoice_date, i.due_date::text as due_date, i.amount
     from invoices i
     join entities e on e.id = i.entity_id
     where e.firm_id = ${scope.firmId}
     order by i.invoice_date, i.invoice_no`;
  const settlements = await sql<{
    id: string;
    invoice_id: string;
    settled_on: string;
    amount: string | number;
    journal_id: string | null;
  }>`select s.id, s.invoice_id, s.settled_on::text as settled_on, s.amount, s.journal_id
     from invoice_settlements s
     join invoices i on i.id = s.invoice_id
     join entities e on e.id = i.entity_id
     where e.firm_id = ${scope.firmId}
     order by s.settled_on`;
  const assets = await sql<{
    id: string;
    entity_id: string;
    name: string;
    category: FixedAsset["category"];
    acquired: string;
    cost: string | number;
    disposed: string | null;
    proceeds: string | number;
    tax_wdv: string | number | null;
  }>`select f.id, f.entity_id, f.name, f.category, f.acquired::text as acquired, f.cost, f.disposed::text as disposed, f.proceeds, f.tax_wdv
     from fixed_assets f
     join entities e on e.id = f.entity_id
     where e.firm_id = ${scope.firmId}
     order by f.acquired, f.name`;
  const reviews = await sql<{ entity_id: string; status: ReviewStatus; note: string }>`
    select r.entity_id, r.status, r.note
    from reviews r
    join entities e on e.id = r.entity_id
    where e.firm_id = ${scope.firmId}`;
  const requests = await sql<{
    id: string;
    entity_id: string;
    title: string;
    detail: string;
    status: "open" | "received";
  }>`select c.id, c.entity_id, c.title, c.detail, c.status
     from client_requests c
     join entities e on e.id = c.entity_id
     where e.firm_id = ${scope.firmId}
     order by c.status, c.title`;
  const employees = await sql<{ id: string; entity_id: string; name: string; monthly_pay: string | number }>`
    select m.id, m.entity_id, m.name, m.monthly_pay
    from employees m join entities e on e.id = m.entity_id
    where e.firm_id = ${scope.firmId} order by m.name`;
  const paySlips = await sql<{
    id: string;
    entity_id: string;
    employee_id: string;
    paid_on: string;
    gross: string | number;
    employee_mpf: string | number;
    employer_mpf: string | number;
    net_pay: string | number;
  }>`select p.id, p.entity_id, p.employee_id, p.paid_on::text as paid_on, p.gross, p.employee_mpf, p.employer_mpf, p.net_pay
     from pay_slips p join entities e on e.id = p.entity_id
     where e.firm_id = ${scope.firmId} order by p.paid_on`;
  const stock = await sql<{
    id: string;
    entity_id: string;
    sku: string;
    name: string;
    qty: string | number;
    unit_cost: string | number;
  }>`select s.id, s.entity_id, s.sku, s.name, s.qty, s.unit_cost
     from stock_items s join entities e on e.id = s.entity_id
     where e.firm_id = ${scope.firmId} order by s.sku`;
  const leaseRows = await sql<{
    id: string;
    entity_id: string;
    name: string;
    started: string;
    months: number;
    payment: string | number;
    annual_rate: string | number;
    cost: string | number;
    liability: string | number;
    posted_months: number;
  }>`select l.id, l.entity_id, l.name, l.started::text as started, l.months, l.payment, l.annual_rate, l.cost, l.liability, l.posted_months
     from leases l join entities e on e.id = l.entity_id
     where e.firm_id = ${scope.firmId} order by l.started`;
  const eliminations = await sql<{
    id: string;
    debit_code: string;
    credit_code: string;
    amount: string | number;
    reason: string;
    eliminated_on: string;
  }>`select id, debit_code, credit_code, amount, reason, eliminated_on::text as eliminated_on
     from eliminations order by eliminated_on`;
  const taxAdjustments = await sql<{
    id: string;
    entity_id: string;
    label: string;
    amount: string | number;
    kind: "add" | "deduct" | "loss_bf";
  }>`select t.id, t.entity_id, t.label, t.amount, t.kind
     from tax_adjustments t
     join entities e on e.id = t.entity_id
     where e.firm_id = ${scope.firmId}
     order by t.label`;
  const paperRows = await sql<{ entity_id: string; payload: string }>`
    select p.entity_id, p.payload
    from entity_papers p
    join entities e on e.id = p.entity_id
    where e.firm_id = ${scope.firmId}`;

  const linesByJournal = new Map<string, Journal["lines"]>();
  for (const line of lines) {
    const bucket = linesByJournal.get(line.journal_id) ?? [];
    bucket.push({
      id: line.id,
      accountId: line.account_id,
      debit: num(line.debit),
      credit: num(line.credit),
      description: line.description,
    });
    linesByJournal.set(line.journal_id, bucket);
  }

  return {
    firmName: scope.firmName,
    role: scope.role,
    entities: entities.map((row) => ({
      id: row.id,
      name: row.name,
      crNumber: row.cr_number,
      currency: row.currency,
      yearEnd: row.year_end,
      incorporated: row.incorporated ? String(row.incorporated).slice(0, 10) : undefined,
      registeredOffice: row.registered_office ?? undefined,
    })),
    periods: periods.map((row) => ({
      entityId: row.entity_id,
      label: row.label,
      status: row.status,
      startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : undefined,
      endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : undefined,
    })),
    accounts: accounts.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      code: row.code,
      name: row.name,
      type: asType(row.type),
      flow: asFlow(row.flow),
    })),
    journals: journals.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      voucherNumber: row.voucher_number,
      date: String(row.journal_date).slice(0, 10),
      reason: row.reason,
      status: row.status,
      lines: linesByJournal.get(row.id) ?? [],
    })),
    audit: audit.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      action: row.action,
      detail: row.detail,
      createdAt: row.created_at,
    })),
    bankLines: bank.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      date: String(row.line_date).slice(0, 10),
      description: row.description,
      amount: num(row.amount),
      matchedJournalId: row.matched_journal_id,
    })),
    documents: documents.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      filename: row.filename,
      mime: row.mime,
      createdAt: row.created_at,
    })),
    links: links.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      journalId: row.journal_id,
    })),
    officers: officers.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      role: row.role,
      name: row.name,
      detail: row.detail,
      appointed: String(row.appointed).slice(0, 10),
    })),
    invoices: invoices.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      kind: row.kind,
      party: row.party,
      number: row.invoice_no,
      invoiceDate: String(row.invoice_date).slice(0, 10),
      dueDate: String(row.due_date).slice(0, 10),
      amount: num(row.amount),
    })),
    settlements: settlements.map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      settledOn: String(row.settled_on).slice(0, 10),
      amount: num(row.amount),
      journalId: row.journal_id,
    })),
    assets: assets.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      name: row.name,
      category: row.category,
      acquired: String(row.acquired).slice(0, 10),
      cost: num(row.cost),
      disposed: row.disposed ? String(row.disposed).slice(0, 10) : null,
      proceeds: num(row.proceeds),
      taxWdv: row.tax_wdv == null ? null : num(row.tax_wdv),
    })),
    reviews: reviews.map((row) => ({
      entityId: row.entity_id,
      status: row.status,
      note: row.note,
    })),
    requests: requests.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      title: row.title,
      detail: row.detail,
      status: row.status,
    })),
    employees: employees.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      name: row.name,
      monthlyPay: num(row.monthly_pay),
    })),
    paySlips: paySlips.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      employeeId: row.employee_id,
      paidOn: String(row.paid_on).slice(0, 10),
      gross: num(row.gross),
      employeeMpf: num(row.employee_mpf),
      employerMpf: num(row.employer_mpf),
      net: num(row.net_pay),
    })),
    stock: stock.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      sku: row.sku,
      name: row.name,
      qty: num(row.qty),
      unitCost: num(row.unit_cost),
    })),
    leases: leaseRows.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      name: row.name,
      started: String(row.started).slice(0, 10),
      months: row.months,
      payment: num(row.payment),
      annualRate: num(row.annual_rate),
      cost: num(row.cost),
      liability: num(row.liability),
      postedMonths: row.posted_months,
    })),
    eliminations: eliminations.map((row) => ({
      id: row.id,
      debitCode: row.debit_code,
      creditCode: row.credit_code,
      amount: num(row.amount),
      reason: row.reason,
      eliminatedOn: String(row.eliminated_on).slice(0, 10),
    })),
    taxAdjustments: taxAdjustments.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      label: row.label,
      amount: num(row.amount),
      kind: row.kind,
    })),
    papers: paperRows.map((row) => parsePaper(row.entity_id, row.payload)),
  };
}

export function owns(snapshot: LedgerSnapshot, entityId: string): boolean {
  return snapshot.entities.some((entity) => entity.id === entityId);
}

export interface PostPayload {
  entityId: string;
  voucherNumber: string;
  date: string;
  reason: string;
  lines: { accountId: string; debit: number; credit: number; description: string }[];
}

export async function postVoucher(
  sql: Sql,
  snapshot: LedgerSnapshot,
  input: PostPayload,
): Promise<{ error: string | null; journalId: string | null }> {
  const error = await insertJournal(sql, input, snapshot);
  if (error) return { error, journalId: null };
  const id = await postedId(sql, input.entityId, input.voucherNumber.trim());
  return { error: null, journalId: id };
}

async function insertJournal(sql: Sql, input: PostPayload, snapshot: LedgerSnapshot): Promise<string | null> {
  if (!owns(snapshot, input.entityId)) return "That company is not in your firm.";
  if (snapshot.role === "reviewer") return "A reviewer cannot post. A preparer or partner has to.";
  const mine = snapshot.periods.filter((item) => item.entityId === input.entityId);
  const open = mine.filter((item) => item.status === "open");
  const dated = open.filter((item) => item.startsOn && item.endsOn);
  const covering = input.date ? dated.find((item) => input.date >= item.startsOn! && input.date <= item.endsOn!) : undefined;
  if (dated.length && !covering) return "That date is not inside an open period. Post it in the year that is open, or reopen the closed year.";
  const period = covering ?? open[0] ?? mine[0];
  const error = assertPostable({
    period,
    voucherNumber: input.voucherNumber,
    existing: snapshot.journals,
    entityId: input.entityId,
    lines: input.lines,
  });
  if (error) return error;
  if (!input.date) return "Date is required.";
  const review = snapshot.reviews.find((item) => item.entityId === input.entityId);
  const signed = review?.status === "signed" || review?.status === "released";
  if (signed && !/post-sign adjustment/i.test(input.reason)) {
    return "The file is signed. A later journal must be narrated as a post-sign adjustment.";
  }
  const known = new Set(snapshot.accounts.filter((account) => account.entityId === input.entityId).map((account) => account.id));
  if (input.lines.some((line) => !known.has(line.accountId))) return "A line points at an unknown account.";

  const id = uid("jv");
  const voucher = input.voucherNumber.trim();
  const params: unknown[] = [id, input.entityId, voucher, input.date, input.reason.trim() || "Manual journal"];
  const tuples = input.lines.map((line, index) => {
    const base = params.length + 1;
    params.push(uid("ln"), line.accountId, round2(line.debit), round2(line.credit), line.description || "", index);
    return `($${base}::text, $${base + 1}::text, $${base + 2}::numeric, $${base + 3}::numeric, $${base + 4}::text, $${base + 5}::int)`;
  });
  try {
    await sql.query(
      `with posted as (
         insert into journals (id, entity_id, voucher_number, journal_date, reason, status)
         values ($1, $2, $3, $4, $5, 'posted')
         returning id
       )
       insert into journal_lines (id, journal_id, account_id, debit, credit, description, line_no)
       select v.id, posted.id, v.account_id, v.debit, v.credit, v.description, v.line_no
       from posted
       cross join (values ${tuples.join(", ")}) as v(id, account_id, debit, credit, description, line_no)`,
      params,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not post the journal.";
    if (/unique|duplicate/i.test(message)) return `Voucher ${voucher} already exists for this entity.`;
    return message;
  }
  await sql`insert into audit_events (id, entity_id, action, detail)
    values (${uid("au")}, ${input.entityId}, 'post', ${signed ? `Post-sign adjustment ${voucher}: ${input.reason.trim()}` : `Posted ${voucher}`})`;
  if (signed) {
    await sql`update reviews set status = 'submitted', note = ${`Post-sign adjustment: ${input.reason.trim()}`}, updated_at = now() where entity_id = ${input.entityId}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${input.entityId}, 'review', ${`Returned to review because of ${voucher}`})`;
  }
  return null;
}

async function ensureAccount(sql: Sql, snapshot: LedgerSnapshot, entityId: string, name: string): Promise<Account> {
  const existing = snapshot.accounts.find(
    (account) => account.entityId === entityId && account.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing;
  const siblings = snapshot.accounts.filter((account) => account.entityId === entityId);
  const codes = siblings.map((account) => Number(account.code)).filter((code) => Number.isFinite(code));
  const created: Account = {
    id: uid("ac"),
    entityId,
    code: String((codes.length ? Math.max(...codes) : 6999) + 1),
    name,
    type: guessAccountType(name),
  };
  created.flow = accountFlow(created);
  await sql`insert into accounts (id, entity_id, code, name, type, flow)
    values (${created.id}, ${created.entityId}, ${created.code}, ${created.name}, ${created.type}, ${created.flow ?? null})`;
  snapshot.accounts.push(created);
  return created;
}

function cashMoves(snapshot: LedgerSnapshot, entityId: string) {
  return snapshot.journals
    .filter((journal) => journal.entityId === entityId)
    .flatMap((journal) =>
      journal.lines
        .filter((line) => {
          const account = snapshot.accounts.find((item) => item.id === line.accountId);
          return account ? accountFlow(account) === "cash" : false;
        })
        .map((line) => ({
          journalId: journal.id,
          date: journal.date,
          amount: round2(line.debit - line.credit),
          description: line.description || journal.reason,
        })),
    );
}

async function matchOpen(sql: Sql, snapshot: LedgerSnapshot, entityId: string) {
  const used = new Set(snapshot.bankLines.map((line) => line.matchedJournalId).filter(Boolean));
  const moves = cashMoves(snapshot, entityId);
  for (const line of snapshot.bankLines.filter((item) => item.entityId === entityId && !item.matchedJournalId)) {
    const hit = moves.find(
      (move) => !used.has(move.journalId) && move.date === line.date && Math.abs(move.amount - line.amount) < 0.02,
    );
    if (!hit) continue;
    used.add(hit.journalId);
    await sql`update bank_lines set matched_journal_id = ${hit.journalId} where id = ${line.id} and entity_id = ${entityId}`;
  }
}

const arthurReady = globalThis as { __arthurBooksReady?: Promise<void> };

export const loadLedger = createServerFn({ method: "GET" }).handler(async (): Promise<LedgerSnapshot> => {
  const sql = await getSql();
  const scope = await practice(sql);
  arthurReady.__arthurBooksReady ??= ensureRegisters(sql, scope.firmId).then(
    () => undefined,
    (err: unknown) => {
      arthurReady.__arthurBooksReady = undefined;
      throw err;
    },
  );
  await arthurReady.__arthurBooksReady;
  return readSnapshot(sql, scope);
});

export const postJournalFn = createServerFn({ method: "POST" })
  .validator((input: PostPayload) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const error = await insertJournal(sql, data, snapshot);
    return { error, snapshot: await readSnapshot(sql, scope) };
  });

export const setPeriodFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; status: PeriodStatus }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const current = await readSnapshot(sql, scope);
    if (!owns(current, data.entityId)) return { error: "That company is not in your firm.", snapshot: current };
    if (current.role === "preparer") return { error: "A preparer cannot lock or reopen a period.", snapshot: current };
    if (data.status !== "open" && data.status !== "locked") return { error: "Unknown period status.", snapshot: current };
    await sql`update periods set status = ${data.status} where entity_id = ${data.entityId}`;
    if (data.status === "open") {
      await sql`update reviews set status = 'draft', note = 'Reopened. Anything released was withdrawn.', updated_at = now()
        where entity_id = ${data.entityId} and status <> 'draft'`;
    }
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'period', ${data.status === "locked" ? "Locked the period" : "Reopened the period"})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const importVouchersFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; vouchers: ImportVoucher[]; nameToId: Record<string, string>; mode?: "all" | "clean" }) => input)
  .handler(async ({ data }): Promise<{ posted: string[]; skipped: string[]; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const posted: string[] = [];
    const skipped: string[] = [];
    const snapshot = await readSnapshot(sql, scope);
    if (snapshot.role === "reviewer") {
      return { posted, skipped: ["A reviewer cannot import journals."], snapshot };
    }
    if (!owns(snapshot, data.entityId)) {
      return { posted, skipped: ["That company is not in your firm."], snapshot };
    }
    const mode = data.mode === "clean" ? "clean" : "all";
    const blocking = data.vouchers.flatMap((voucher) => {
      const issues = voucher.issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
      if (!voucher.voucherNumber) issues.push("A voucher has no number.");
      if (!voucher.date) issues.push(`${voucher.voucherNumber || "A voucher"} has no date.`);
      return issues;
    });
    if (mode === "all" && blocking.length) {
      return {
        posted,
        skipped: [
          `Batch rejected. Nothing was posted. ${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}: ${blocking.slice(0, 8).join(" ")}`,
        ],
        snapshot,
      };
    }
    const seen = new Set(snapshot.journals.filter((journal) => journal.entityId === data.entityId).map((journal) => journal.voucherNumber));
    for (const voucher of data.vouchers) {
      const blocked = voucher.issues.some((issue) => issue.level === "error") || !voucher.voucherNumber || !voucher.date;
      if (blocked) {
        skipped.push(voucher.voucherNumber || "blank voucher");
        continue;
      }
      if (seen.has(voucher.voucherNumber)) {
        skipped.push(`${voucher.voucherNumber}: already on the file`);
        continue;
      }
      const lines = [];
      for (const line of voucher.lines) {
        const mapped = data.nameToId[line.accountName.toLowerCase()];
        const accountId = mapped || (await ensureAccount(sql, snapshot, data.entityId, line.accountName)).id;
        lines.push({
          accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        });
      }
      const error = await insertJournal(
        sql,
        {
          entityId: data.entityId,
          voucherNumber: voucher.voucherNumber,
          date: voucher.date,
          reason: "Imported journal",
          lines,
        },
        snapshot,
      );
      if (error) skipped.push(`${voucher.voucherNumber}: ${error}`);
      else {
        posted.push(voucher.voucherNumber);
        seen.add(voucher.voucherNumber);
        snapshot.journals.push({
          id: uid("jv"),
          entityId: data.entityId,
          voucherNumber: voucher.voucherNumber,
          date: voucher.date,
          reason: "Imported journal",
          status: "posted",
          lines: [],
        });
      }
    }
    return { posted, skipped, snapshot: await readSnapshot(sql, scope) };
  });

const ACCOUNT_TYPES: AccountType[] = ["asset", "contra_asset", "liability", "equity", "revenue", "expense"];

export const reverseJournalFn = createServerFn({ method: "POST" })
  .validator((input: { journalId: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const journal = snapshot.journals.find((item) => item.id === data.journalId);
    if (!journal) return { error: "That journal is not on the file.", snapshot };
    if (!owns(snapshot, journal.entityId)) return { error: "That company is not in your firm.", snapshot };
    let voucher = `REV-${journal.voucherNumber}`;
    let n = 2;
    while (snapshot.journals.some((item) => item.entityId === journal.entityId && item.voucherNumber === voucher)) {
      voucher = `REV-${journal.voucherNumber}-${n}`;
      n += 1;
    }
    const error = await insertJournal(
      sql,
      {
        entityId: journal.entityId,
        voucherNumber: voucher,
        date: journal.date,
        reason: `Reversal of ${journal.voucherNumber}`,
        lines: journal.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          description: line.description ? `Reversal — ${line.description}` : "Reversal",
        })),
      },
      snapshot,
    );
    return { error, snapshot: await readSnapshot(sql, scope) };
  });

export const addAccountFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; code: string; name: string; type: AccountType }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot };
    const code = data.code.trim();
    const name = data.name.trim();
    if (!code || !name) return { error: "Code and account name are required.", snapshot };
    if (!ACCOUNT_TYPES.includes(data.type)) return { error: "Unknown account type.", snapshot };
    if (snapshot.accounts.some((account) => account.entityId === data.entityId && account.code === code)) {
      return { error: `Account ${code} already exists.`, snapshot };
    }
    const account: Account = { id: uid("ac"), entityId: data.entityId, code, name, type: data.type };
    account.flow = accountFlow(account);
    await sql`insert into accounts (id, entity_id, code, name, type, flow)
      values (${account.id}, ${account.entityId}, ${account.code}, ${account.name}, ${account.type}, ${account.flow ?? null})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const setAccountTypeFn = createServerFn({ method: "POST" })
  .validator((input: { accountId: string; type: AccountType }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const account = snapshot.accounts.find((item) => item.id === data.accountId);
    if (!account || !owns(snapshot, account.entityId)) return { error: "That account is not in your firm.", snapshot };
    if (!ACCOUNT_TYPES.includes(data.type)) return { error: "Unknown account type.", snapshot };
    const next: Account = { ...account, type: data.type, flow: undefined };
    const flow = accountFlow(next);
    await sql`update accounts set type = ${data.type}, flow = ${flow} where id = ${account.id}`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const importBankFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; rows: { date: string; description: string; amount: number }[] }) => input)
  .handler(async ({ data }): Promise<{ added: number; snapshot: LedgerSnapshot; error: string | null }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { added: 0, error: "That company is not in your firm.", snapshot };
    if (snapshot.role === "reviewer") return { added: 0, error: "A reviewer cannot import a bank statement.", snapshot };
    let added = 0;
    for (const row of data.rows) {
      if (!row.date || !Number.isFinite(row.amount)) continue;
      await sql`insert into bank_lines (id, entity_id, line_date, description, amount)
        values (${uid("bk")}, ${data.entityId}, ${row.date}, ${row.description || "Bank line"}, ${round2(row.amount)})`;
      added += 1;
    }
    await matchOpen(sql, await readSnapshot(sql, scope), data.entityId);
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'bank', ${`Imported ${added} bank lines`})`;
    return { added, error: null, snapshot: await readSnapshot(sql, scope) };
  });

const MAX_FILE = 4_000_000;

export const uploadDocumentFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; filename: string; mime: string; body: string; journalId?: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot; documentId: string | null }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot, documentId: null };
    if (!data.filename || !data.body) return { error: "Choose a file first.", snapshot, documentId: null };
    if (data.body.length > MAX_FILE * 1.4) return { error: "Keep the file under 4 MB.", snapshot, documentId: null };
    const id = uid("doc");
    await sql`insert into documents (id, entity_id, filename, mime, body)
      values (${id}, ${data.entityId}, ${data.filename}, ${data.mime || "application/octet-stream"}, ${data.body})`;
    if (data.journalId && snapshot.journals.some((journal) => journal.id === data.journalId && journal.entityId === data.entityId)) {
      await sql`insert into evidence_links (id, document_id, journal_id) values (${uid("ev")}, ${id}, ${data.journalId})`;
    }
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'document', ${`Filed ${data.filename}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope), documentId: id };
  });

export const linkDocumentFn = createServerFn({ method: "POST" })
  .validator((input: { documentId: string; journalId: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const document = snapshot.documents.find((item) => item.id === data.documentId);
    const journal = snapshot.journals.find((item) => item.id === data.journalId);
    if (!document || !journal || document.entityId !== journal.entityId) {
      return { error: "That document and voucher are not in the same company.", snapshot };
    }
    const existing = snapshot.links.some((link) => link.documentId === data.documentId && link.journalId === data.journalId);
    if (!existing) {
      await sql`insert into evidence_links (id, document_id, journal_id) values (${uid("ev")}, ${data.documentId}, ${data.journalId})`;
    }
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const openDocumentFn = createServerFn({ method: "POST" })
  .validator((input: { documentId: string }) => input)
  .handler(async ({ data }): Promise<{ filename: string; mime: string; body: string } | null> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const rows = await sql<{ filename: string; mime: string; body: string }>`
      select d.filename, d.mime, d.body
      from documents d
      join entities e on e.id = d.entity_id
      where d.id = ${data.documentId} and e.firm_id = ${scope.firmId}`;
    return rows[0] ?? null;
  });

export async function ensureCode(
  sql: Sql,
  snapshot: LedgerSnapshot,
  entityId: string,
  code: string,
  name: string,
  type: AccountType,
  flow: CashFlowClass,
): Promise<Account> {
  const found = snapshot.accounts.find((account) => account.entityId === entityId && account.code === code);
  if (found) return found;
  const created: Account = { id: uid("ac"), entityId, code, name, type, flow };
  await sql`insert into accounts (id, entity_id, code, name, type, flow)
    values (${created.id}, ${entityId}, ${code}, ${name}, ${type}, ${flow})`;
  snapshot.accounts.push(created);
  return created;
}

async function postedId(sql: Sql, entityId: string, voucher: string): Promise<string | null> {
  const rows = await sql<{ id: string }>`select id from journals where entity_id = ${entityId} and voucher_number = ${voucher} limit 1`;
  return rows[0]?.id ?? null;
}

export const createInvoiceFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      entityId: string;
      kind: InvoiceKind;
      party: string;
      number: string;
      invoiceDate: string;
      dueDate: string;
      amount: number;
      documentId?: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot };
    const party = data.party.trim();
    const number = data.number.trim();
    const amount = round2(data.amount);
    if (!party || !number || !data.invoiceDate || !data.dueDate) return { error: "Party, number, and both dates are required.", snapshot };
    if (!(amount > 0)) return { error: "The invoice amount has to be more than zero.", snapshot };
    if (snapshot.invoices.some((invoice) => invoice.entityId === data.entityId && invoice.number === number)) {
      return { error: `Invoice ${number} is already on the subledger.`, snapshot };
    }
    const control = await ensureCode(
      sql,
      snapshot,
      data.entityId,
      data.kind === "receivable" ? "1100" : "2000",
      data.kind === "receivable" ? "Accounts receivable" : "Accounts payable",
      data.kind === "receivable" ? "asset" : "liability",
      "operating",
    );
    const other = await ensureCode(
      sql,
      snapshot,
      data.entityId,
      data.kind === "receivable" ? "4000" : "5000",
      data.kind === "receivable" ? "Sales" : "Purchases",
      data.kind === "receivable" ? "revenue" : "expense",
      "profit",
    );
    const lines =
      data.kind === "receivable"
        ? [
            { accountId: control.id, debit: amount, credit: 0, description: party },
            { accountId: other.id, debit: 0, credit: amount, description: party },
          ]
        : [
            { accountId: other.id, debit: amount, credit: 0, description: party },
            { accountId: control.id, debit: 0, credit: amount, description: party },
          ];
    const error = await insertJournal(
      sql,
      { entityId: data.entityId, voucherNumber: number, date: data.invoiceDate, reason: `${party} invoice`, lines },
      snapshot,
    );
    if (error) return { error, snapshot };
    const journalId = await postedId(sql, data.entityId, number);
    await sql`insert into invoices (id, entity_id, kind, party, invoice_no, invoice_date, due_date, amount)
      values (${uid("inv")}, ${data.entityId}, ${data.kind}, ${party}, ${number}, ${data.invoiceDate}, ${data.dueDate}, ${amount})`;
    if (data.documentId && journalId && snapshot.documents.some((item) => item.id === data.documentId && item.entityId === data.entityId)) {
      await sql`insert into evidence_links (id, document_id, journal_id) values (${uid("ev")}, ${data.documentId}, ${journalId})`;
    }
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const settleInvoiceFn = createServerFn({ method: "POST" })
  .validator((input: { invoiceId: string; date: string; amount: number }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const invoice = snapshot.invoices.find((item) => item.id === data.invoiceId);
    if (!invoice) return { error: "That invoice is not in the books.", snapshot };
    const amount = round2(data.amount);
    const open = outstanding(invoice, snapshot.settlements);
    if (!(amount > 0) || amount - open > 0.001) return { error: `You can settle up to ${open.toFixed(2)}.`, snapshot };
    if (!data.date) return { error: "The settlement needs a date.", snapshot };
    const cash = snapshot.accounts.find((account) => account.entityId === invoice.entityId && account.code === "1000");
    const control = snapshot.accounts.find(
      (account) => account.entityId === invoice.entityId && account.code === (invoice.kind === "receivable" ? "1100" : "2000"),
    );
    if (!cash || !control) return { error: "Cash or the control account is missing.", snapshot };
    let voucher = `SET-${invoice.number}`;
    if (snapshot.journals.some((journal) => journal.entityId === invoice.entityId && journal.voucherNumber === voucher)) {
      voucher = `SET-${invoice.number}-${data.date}`;
    }
    const lines =
      invoice.kind === "receivable"
        ? [
            { accountId: cash.id, debit: amount, credit: 0, description: invoice.party },
            { accountId: control.id, debit: 0, credit: amount, description: invoice.party },
          ]
        : [
            { accountId: control.id, debit: amount, credit: 0, description: invoice.party },
            { accountId: cash.id, debit: 0, credit: amount, description: invoice.party },
          ];
    const error = await insertJournal(
      sql,
      { entityId: invoice.entityId, voucherNumber: voucher, date: data.date, reason: `Settlement of ${invoice.number}`, lines },
      snapshot,
    );
    if (error) return { error, snapshot };
    const journalId = await postedId(sql, invoice.entityId, voucher);
    await sql`insert into invoice_settlements (id, invoice_id, settled_on, amount, journal_id)
      values (${uid("set")}, ${invoice.id}, ${data.date}, ${amount}, ${journalId})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const createAssetFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      entityId: string;
      name: string;
      category: FixedAsset["category"];
      acquired: string;
      cost: number;
      fund: "cash" | "director";
      taxWdv: number | null;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot };
    const name = data.name.trim();
    const cost = round2(data.cost);
    if (!name || !data.acquired) return { error: "The asset needs a name and a date.", snapshot };
    if (!(cost > 0)) return { error: "Cost has to be more than zero.", snapshot };
    if (data.category !== "building" && data.category !== "plant") return { error: "Choose a building or plant.", snapshot };
    const assetAccount = await ensureCode(
      sql,
      snapshot,
      data.entityId,
      "1500",
      "Property, plant and equipment",
      "asset",
      "investing",
    );
    const credit =
      data.fund === "director"
        ? await ensureCode(sql, snapshot, data.entityId, "2100", "Due to director", "liability", "financing")
        : snapshot.accounts.find((account) => account.entityId === data.entityId && account.code === "1000");
    if (!credit) return { error: "There is no cash account to pay from.", snapshot };
    const voucher = `FA-${data.acquired}-${name.slice(0, 12).replace(/\s+/g, "")}`;
    const error = await insertJournal(
      sql,
      {
        entityId: data.entityId,
        voucherNumber: voucher,
        date: data.acquired,
        reason: `Acquisition of ${name}`,
        lines: [
          { accountId: assetAccount.id, debit: cost, credit: 0, description: name },
          { accountId: credit.id, debit: 0, credit: cost, description: name },
        ],
      },
      snapshot,
    );
    if (error) return { error, snapshot };
    await sql`insert into fixed_assets (id, entity_id, name, category, acquired, cost, tax_wdv)
      values (${uid("fa")}, ${data.entityId}, ${name}, ${data.category}, ${data.acquired}, ${cost}, ${data.taxWdv})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

function booksReady(snapshot: LedgerSnapshot, entityId: string): string | null {
  const rows = trialBalance(snapshot.accounts, snapshot.journals, entityId);
  const totals = tbTotals(rows);
  if (Math.abs(totals.debit - totals.credit) >= 0.02) return "The trial balance does not agree.";
  if (!statements(rows).balanced) return "The balance sheet does not agree.";
  return null;
}

export const setReviewFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; action: "submit" | "return" | "review" | "sign" | "release"; note?: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot };
    const review = snapshot.reviews.find((item) => item.entityId === data.entityId);
    const status = review?.status ?? "draft";
    const note = (data.note ?? "").trim();
    const fail = (error: string) => ({ error, snapshot });

    if (data.action === "submit") {
      if (snapshot.role === "reviewer") return fail("A reviewer does not submit the file. A preparer or partner does.");
      if (status !== "draft" && status !== "returned") return fail("Only a draft or a returned file can be submitted.");
      const blocked = booksReady(snapshot, data.entityId);
      if (blocked) return fail(blocked);
      await sql`update reviews set status = 'submitted', note = ${note}, updated_at = now() where entity_id = ${data.entityId}`;
      await sql`insert into audit_events (id, entity_id, action, detail) values (${uid("au")}, ${data.entityId}, 'review', 'Submitted for review')`;
    } else if (data.action === "return") {
      if (snapshot.role === "preparer") return fail("A preparer cannot send a file back. Switch to reviewer or partner.");
      if (status !== "submitted") return fail("Only a submitted file can be sent back.");
      if (!note) return fail("Say what has to change.");
      await sql`update reviews set status = 'returned', note = ${note}, updated_at = now() where entity_id = ${data.entityId}`;
      await sql`insert into audit_events (id, entity_id, action, detail) values (${uid("au")}, ${data.entityId}, 'review', ${`Sent back: ${note}`})`;
    } else if (data.action === "review") {
      if (snapshot.role === "preparer") return fail("A preparer cannot mark the file reviewed.");
      if (status !== "submitted") return fail("Review starts from a submitted file.");
      await sql`update reviews set status = 'reviewed', note = ${note}, updated_at = now() where entity_id = ${data.entityId}`;
      await sql`insert into audit_events (id, entity_id, action, detail) values (${uid("au")}, ${data.entityId}, 'review', 'Reviewed')`;
    } else if (data.action === "sign") {
      if (snapshot.role !== "partner") return fail("Only a partner can sign the file.");
      if (status !== "reviewed") return fail("Sign only after the file has been reviewed.");
      await sql`update reviews set status = 'signed', note = ${note}, updated_at = now() where entity_id = ${data.entityId}`;
      await sql`update periods set status = 'locked' where entity_id = ${data.entityId} and status = 'open' and starts_on is null`;
      await sql`insert into audit_events (id, entity_id, action, detail) values (${uid("au")}, ${data.entityId}, 'review', 'Signed. The period is locked.')`;
    } else if (data.action === "release") {
      if (snapshot.role !== "partner") return fail("Only a partner can release the file to the client.");
      if (status !== "signed") return fail("Release only after the file is signed.");
      await sql`update reviews set status = 'released', note = ${note}, updated_at = now() where entity_id = ${data.entityId}`;
      await sql`insert into audit_events (id, entity_id, action, detail) values (${uid("au")}, ${data.entityId}, 'review', 'Released to the client')`;
    } else {
      return fail("Unknown review step.");
    }
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const addRequestFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; title: string; detail?: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    if (!owns(snapshot, data.entityId)) return { error: "That company is not in your firm.", snapshot };
    const title = data.title.trim();
    if (!title) return { error: "Say what you need from the client.", snapshot };
    await sql`insert into client_requests (id, entity_id, title, detail, status)
      values (${uid("req")}, ${data.entityId}, ${title}, ${(data.detail ?? "").trim()}, 'open')`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const fulfillRequestFn = createServerFn({ method: "POST" })
  .validator((input: { requestId: string; filename: string; mime: string; body: string }) => input)
  .handler(async ({ data }): Promise<{ error: string | null; snapshot: LedgerSnapshot }> => {
    const sql = await getSql();
    const scope = await practice(sql);
    const snapshot = await readSnapshot(sql, scope);
    const request = snapshot.requests.find((item) => item.id === data.requestId);
    if (!request) return { error: "That request is not on this file.", snapshot };
    if (!data.filename || !data.body) return { error: "Choose a file first.", snapshot };
    if (data.body.length > MAX_FILE * 1.4) return { error: "Keep the file under 4 MB.", snapshot };
    const documentId = uid("doc");
    await sql`insert into documents (id, entity_id, filename, mime, body)
      values (${documentId}, ${request.entityId}, ${data.filename}, ${data.mime || "application/octet-stream"}, ${data.body})`;
    await sql`update client_requests set status = 'received', document_id = ${documentId} where id = ${request.id}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${request.entityId}, 'request', ${`Client sent ${data.filename} for ${request.title}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });



