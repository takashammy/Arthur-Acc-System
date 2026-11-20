import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { leaseCharge, leasePresentValue } from "./lease";
import {
  ensureCode,
  owns,
  parsePaper,
  postVoucher,
  practice,
  readSnapshot,
  type EntityPaper,
  type LedgerSnapshot,
} from "./ledger.functions";
import { round2 } from "./money";
import { closingLines } from "./close";
import { trialBalance, uid, accountFlow, STANDARD_CODES } from "./model";
import { daysBetween, nextYearEndLabel, yearEndIso, yearStartIso } from "./subledger";
import { mpfSplit } from "./payroll";

async function scopeOf() {
  const sql = await getSql();
  const scope = await practice(sql);
  const snapshot = await readSnapshot(sql, scope);
  return { sql, scope, snapshot };
}

function blocked(snapshot: LedgerSnapshot, error: string) {
  return { error, snapshot };
}

export const createCompanyFn = createServerFn({ method: "POST" })
  .validator((input: { name: string; crNumber: string; yearEnd: string; incorporated?: string; registeredOffice?: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    const name = data.name.trim();
    const crNumber = data.crNumber.trim();
    const yearEnd = data.yearEnd.trim();
    if (!name || !crNumber || !yearEnd) return { error: "Company name, CR number, and year end are required.", entityId: null, snapshot };
    if (snapshot.entities.some((entity) => entity.name.toLowerCase() === name.toLowerCase())) {
      return { error: "A company with that name is already on the file.", entityId: null, snapshot };
    }
    const id = uid("ent");
    const year = yearEnd.match(/\d{4}/)?.[0] ?? "2026";
    await sql`insert into entities (id, name, cr_number, currency, year_end, firm_id, incorporated, registered_office)
      values (${id}, ${name}, ${crNumber}, 'HKD', ${yearEnd}, ${scope.firmId}, ${data.incorporated || null}, ${data.registeredOffice?.trim() || null})`;
    await sql`insert into periods (entity_id, label, status) values (${id}, ${`FY${year}`}, 'open')`;
    for (const account of STANDARD_CODES) {
      await sql`insert into accounts (id, entity_id, code, name, type, flow)
        values (${uid("ac")}, ${id}, ${account.code}, ${account.name}, ${account.type}, ${account.flow})`;
    }
    await sql`insert into reviews (entity_id, status, note) values (${id}, 'draft', '')`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${id}, 'open', ${`Company opened: ${name}`})`;
    return { error: null, entityId: id, snapshot: await readSnapshot(sql, scope) };
  });

export const addEmployeeFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; name: string; monthlyPay: number }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const name = data.name.trim();
    const pay = round2(data.monthlyPay);
    if (!name || pay <= 0) return blocked(snapshot, "Name and monthly pay are required.");
    await sql`insert into employees (id, entity_id, name, monthly_pay) values (${uid("emp")}, ${data.entityId}, ${name}, ${pay})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const runPayrollFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; paidOn: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    if (!data.paidOn) return blocked(snapshot, "Pay date is required.");
    const month = data.paidOn.slice(0, 7);
    const staff = snapshot.employees.filter((person) => person.entityId === data.entityId);
    if (staff.length === 0) return blocked(snapshot, "Add an employee first.");
    if (snapshot.paySlips.some((slip) => slip.entityId === data.entityId && slip.paidOn.slice(0, 7) === month)) {
      return blocked(snapshot, "That month has already been paid.");
    }
    const slips = staff.map((person) => ({ person, ...mpfSplit(person.monthlyPay) }));
    const gross = round2(slips.reduce((sum, slip) => sum + slip.gross, 0));
    const employeeMpf = round2(slips.reduce((sum, slip) => sum + slip.employee, 0));
    const employerMpf = round2(slips.reduce((sum, slip) => sum + slip.employer, 0));
    const net = round2(slips.reduce((sum, slip) => sum + slip.net, 0));
    const salaries = await ensureCode(sql, snapshot, data.entityId, "6100", "Salaries", "expense", "profit");
    const cash = snapshot.accounts.find((account) => account.entityId === data.entityId && account.code === "1000");
    if (!cash) return blocked(snapshot, "There is no cash account.");
    const lines = [
      { accountId: salaries.id, debit: gross, credit: 0, description: "Gross pay" },
      { accountId: cash.id, debit: 0, credit: net, description: "Net pay" },
    ];
    if (employerMpf > 0) {
      const expense = await ensureCode(sql, snapshot, data.entityId, "6110", "MPF expense", "expense", "profit");
      lines.push({ accountId: expense.id, debit: employerMpf, credit: 0, description: "Employer MPF" });
    }
    if (employeeMpf + employerMpf > 0) {
      const payable = await ensureCode(sql, snapshot, data.entityId, "2150", "MPF payable", "liability", "operating");
      lines.push({
        accountId: payable.id,
        debit: 0,
        credit: round2(employeeMpf + employerMpf),
        description: "MPF payable",
      });
    }
    const voucher = `PAY-${month.replace("-", "")}`;
    const posted = await postVoucher(sql, snapshot, {
      entityId: data.entityId,
      voucherNumber: voucher,
      date: data.paidOn,
      reason: `Payroll ${month}`,
      lines,
    });
    if (posted.error) return blocked(snapshot, posted.error);
    for (const slip of slips) {
      await sql`insert into pay_slips (id, entity_id, employee_id, paid_on, gross, employee_mpf, employer_mpf, net_pay, journal_id)
        values (${uid("pay")}, ${data.entityId}, ${slip.person.id}, ${data.paidOn}, ${slip.gross}, ${slip.employee}, ${slip.employer}, ${slip.net}, ${posted.journalId})`;
    }
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const addStockFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; sku: string; name: string; unitCost: number }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const sku = data.sku.trim();
    const name = data.name.trim();
    if (!sku || !name || data.unitCost < 0) return blocked(snapshot, "SKU, name, and cost are required.");
    await sql`insert into stock_items (id, entity_id, sku, name, qty, unit_cost)
      values (${uid("stk")}, ${data.entityId}, ${sku}, ${name}, 0, ${round2(data.unitCost)})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const moveStockFn = createServerFn({ method: "POST" })
  .validator((input: { itemId: string; kind: "in" | "out"; qty: number; unitCost: number; date: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    const item = snapshot.stock.find((row) => row.id === data.itemId);
    if (!item) return blocked(snapshot, "That item is not on the register.");
    const qty = round2(data.qty);
    if (qty <= 0 || !data.date) return blocked(snapshot, "Quantity and date are required.");
    const inventory = await ensureCode(sql, snapshot, item.entityId, "1200", "Inventory", "asset", "operating");
    const cash = snapshot.accounts.find((account) => account.entityId === item.entityId && account.code === "1000");
    if (!cash) return blocked(snapshot, "There is no cash account.");
    if (data.kind === "in") {
      const cost = round2(data.unitCost);
      if (cost <= 0) return blocked(snapshot, "Receipts need a unit cost.");
      const amount = round2(qty * cost);
      const posted = await postVoucher(sql, snapshot, {
        entityId: item.entityId,
        voucherNumber: `STKIN-${data.date}-${item.sku}`,
        date: data.date,
        reason: `Stock in ${item.sku}`,
        lines: [
          { accountId: inventory.id, debit: amount, credit: 0, description: item.name },
          { accountId: cash.id, debit: 0, credit: amount, description: item.name },
        ],
      });
      if (posted.error) return blocked(snapshot, posted.error);
      const nextQty = round2(item.qty + qty);
      const average = round2((item.qty * item.unitCost + amount) / nextQty);
      await sql`update stock_items set qty = ${nextQty}, unit_cost = ${average} where id = ${item.id}`;
    } else {
      if (qty > item.qty) return blocked(snapshot, "There is not enough on hand.");
      const amount = round2(qty * item.unitCost);
      const cogs = await ensureCode(sql, snapshot, item.entityId, "5100", "Cost of sales", "expense", "profit");
      const posted = await postVoucher(sql, snapshot, {
        entityId: item.entityId,
        voucherNumber: `STKOUT-${data.date}-${item.sku}`,
        date: data.date,
        reason: `Stock out ${item.sku}`,
        lines: [
          { accountId: cogs.id, debit: amount, credit: 0, description: item.name },
          { accountId: inventory.id, debit: 0, credit: amount, description: item.name },
        ],
      });
      if (posted.error) return blocked(snapshot, posted.error);
      await sql`update stock_items set qty = ${round2(item.qty - qty)} where id = ${item.id}`;
    }
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const addLeaseFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; name: string; started: string; months: number; payment: number; annualRate: number }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const name = data.name.trim();
    const months = Math.round(data.months);
    const payment = round2(data.payment);
    if (!name || !data.started || months < 1 || payment <= 0 || data.annualRate < 0) {
      return blocked(snapshot, "Name, start, term, payment, and rate are required.");
    }
    const cost = leasePresentValue(payment, months, data.annualRate);
    await sql`insert into leases (id, entity_id, name, started, months, payment, annual_rate, cost, liability, posted_months)
      values (${uid("ls")}, ${data.entityId}, ${name}, ${data.started}, ${months}, ${payment}, ${data.annualRate}, ${cost}, ${cost}, -1)`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const recogniseLeaseFn = createServerFn({ method: "POST" })
  .validator((input: { leaseId: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    const lease = snapshot.leases.find((row) => row.id === data.leaseId);
    if (!lease) return blocked(snapshot, "That lease is not on the register.");
    if (lease.postedMonths >= 0) return blocked(snapshot, "This lease is already on the books.");
    const asset = await ensureCode(sql, snapshot, lease.entityId, "1600", "Right-of-use asset", "asset", "investing");
    const liability = await ensureCode(sql, snapshot, lease.entityId, "2400", "Lease liability", "liability", "financing");
    const posted = await postVoucher(sql, snapshot, {
      entityId: lease.entityId,
      voucherNumber: `ROU-${lease.started}`,
      date: lease.started,
      reason: `Recognise ${lease.name}`,
      lines: [
        { accountId: asset.id, debit: lease.cost, credit: 0, description: lease.name },
        { accountId: liability.id, debit: 0, credit: lease.cost, description: lease.name },
      ],
    });
    if (posted.error) return blocked(snapshot, posted.error);
    await sql`update leases set posted_months = 0 where id = ${lease.id}`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const postLeaseMonthFn = createServerFn({ method: "POST" })
  .validator((input: { leaseId: string; date: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    const lease = snapshot.leases.find((row) => row.id === data.leaseId);
    if (!lease) return blocked(snapshot, "That lease is not on the register.");
    if (lease.postedMonths < 0) return blocked(snapshot, "Recognise the lease before posting a month.");
    if (lease.postedMonths >= lease.months) return blocked(snapshot, "The lease term is already posted.");
    if (!data.date) return blocked(snapshot, "Date is required.");
    const charge = leaseCharge(lease.liability, lease.payment, lease.annualRate, lease.cost, lease.months);
    const cash = snapshot.accounts.find((account) => account.entityId === lease.entityId && account.code === "1000");
    if (!cash) return blocked(snapshot, "There is no cash account.");
    const liability = await ensureCode(sql, snapshot, lease.entityId, "2400", "Lease liability", "liability", "financing");
    const depreciation = await ensureCode(sql, snapshot, lease.entityId, "6210", "Depreciation — leases", "expense", "noncash");
    const accumulated = await ensureCode(
      sql,
      snapshot,
      lease.entityId,
      "1610",
      "Accumulated depreciation — leases",
      "contra_asset",
      "noncash",
    );
    const lines = [
      { accountId: liability.id, debit: charge.principal, credit: 0, description: "Principal" },
      { accountId: cash.id, debit: 0, credit: lease.payment, description: lease.name },
      { accountId: depreciation.id, debit: charge.depreciation, credit: 0, description: lease.name },
      { accountId: accumulated.id, debit: 0, credit: charge.depreciation, description: lease.name },
    ];
    if (charge.interest > 0) {
      const interest = await ensureCode(sql, snapshot, lease.entityId, "6300", "Lease interest", "expense", "profit");
      lines.unshift({ accountId: interest.id, debit: charge.interest, credit: 0, description: "Interest" });
    }
    const posted = await postVoucher(sql, snapshot, {
      entityId: lease.entityId,
      voucherNumber: `LEASE-${data.date}-${lease.postedMonths + 1}`,
      date: data.date,
      reason: `${lease.name} month ${lease.postedMonths + 1}`,
      lines,
    });
    if (posted.error) return blocked(snapshot, posted.error);
    await sql`update leases set liability = ${charge.liabilityAfter}, posted_months = ${lease.postedMonths + 1} where id = ${lease.id}`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const addEliminationFn = createServerFn({ method: "POST" })
  .validator((input: { debitCode: string; creditCode: string; amount: number; reason: string; eliminatedOn: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    const debitCode = data.debitCode.trim();
    const creditCode = data.creditCode.trim();
    const amount = round2(data.amount);
    const reason = data.reason.trim();
    if (!debitCode || !creditCode || amount <= 0 || !reason || !data.eliminatedOn) {
      return blocked(snapshot, "Both accounts, an amount, a date, and a reason are required.");
    }
    await sql`insert into eliminations (id, debit_code, credit_code, amount, reason, eliminated_on)
      values (${uid("el")}, ${debitCode}, ${creditCode}, ${amount}, ${reason}, ${data.eliminatedOn})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const setRoleFn = createServerFn({ method: "POST" })
  .validator((input: { role: "partner" | "reviewer" | "preparer"; resume?: boolean }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (data.role !== "partner" && data.role !== "reviewer" && data.role !== "preparer") {
      return blocked(snapshot, "Unknown role.");
    }
    if (snapshot.role !== "partner" && !data.resume) {
      return blocked(snapshot, "Only a partner can change the acting role.");
    }
    if (data.resume && data.role !== "partner") {
      return blocked(snapshot, "Resuming returns the file to the partner.");
    }
    const detail = data.resume ? "Practice owner resumed as partner." : `Acting role set to ${data.role}.`;
    await sql`update firms set acting_role = ${data.role} where id = ${scope.firmId}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${snapshot.entities[0]?.id ?? null}, 'role', ${detail})`;
    return { error: null, snapshot: await readSnapshot(sql, await practice(sql)) };
  });

export const closeYearFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role !== "partner") return blocked(snapshot, "Only a partner can close the year.");
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const entity = snapshot.entities.find((item) => item.id === data.entityId);
    if (!entity) return blocked(snapshot, "That company is not on the file.");
    const yearEnd = yearEndIso(entity.yearEnd);
    const yearStart = yearStartIso(yearEnd);
    const year = yearEnd.slice(0, 4);
    const voucher = `YE-${year}`;
    if (snapshot.journals.some((journal) => journal.entityId === data.entityId && journal.voucherNumber === voucher)) {
      return blocked(snapshot, `${voucher} is already posted. The year is closed.`);
    }
    const retained = await ensureCode(sql, snapshot, data.entityId, "3100", "Retained earnings", "equity", "financing");
    const rows = trialBalance(snapshot.accounts, snapshot.journals, data.entityId, { from: yearStart, to: yearEnd, excludeClose: true });
    const closing = closingLines(rows, { id: retained.id, name: retained.name });
    if (closing.lines.length >= 2) {
      const posted = await postVoucher(sql, snapshot, {
        entityId: data.entityId,
        voucherNumber: voucher,
        date: yearEnd,
        reason: `Year-end close ${entity.yearEnd}`,
        lines: closing.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      });
      if (posted.error) return blocked(snapshot, posted.error);
    }
    const label = snapshot.periods.find((period) => period.entityId === data.entityId && period.status === "open")?.label ?? `FY${year}`;
    await sql`update periods set status = 'locked', starts_on = ${yearStart}, ends_on = ${yearEnd}
      where entity_id = ${data.entityId} and label = ${label}`;
    const nextEnd = nextYearEndLabel(entity.yearEnd);
    const nextIso = yearEndIso(nextEnd);
    const nextStart = yearStartIso(nextIso);
    const nextLabel = `FY${nextIso.slice(0, 4)}`;
    const [{ n }] = await sql<{ n: number }>`select count(*)::int as n from periods where entity_id = ${data.entityId} and label = ${nextLabel}`;
    if (n === 0) {
      await sql`insert into periods (entity_id, label, status, starts_on, ends_on)
        values (${data.entityId}, ${nextLabel}, 'open', ${nextStart}, ${nextIso})`;
    } else {
      await sql`update periods set status = 'open', starts_on = ${nextStart}, ends_on = ${nextIso}
        where entity_id = ${data.entityId} and label = ${nextLabel}`;
    }
    await sql`update entities set year_end = ${nextEnd} where id = ${data.entityId}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'close', ${`Closed ${entity.yearEnd}. Profit ${closing.profit.toFixed(2)} to retained earnings. Opened ${nextLabel}.`})`;
    return { error: null, profit: closing.profit, snapshot: await readSnapshot(sql, scope) };
  });

export const saveAdjustmentFn = createServerFn({ method: "POST" })
  .validator((input: { entityId: string; label: string; amount: number; kind: "add" | "deduct" | "loss_bf" }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot change the tax computation.");
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const label = data.label.trim();
    const amount = round2(data.amount);
    if (!label || !(amount > 0)) return blocked(snapshot, "A description and a positive amount are required.");
    if (data.kind !== "add" && data.kind !== "deduct" && data.kind !== "loss_bf") return blocked(snapshot, "Unknown adjustment.");
    await sql`insert into tax_adjustments (id, entity_id, label, amount, kind)
      values (${uid("tax")}, ${data.entityId}, ${label}, ${amount}, ${data.kind})`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'tax', ${`Tax adjustment: ${label}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const removeAdjustmentFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot change the tax computation.");
    const row = snapshot.taxAdjustments.find((item) => item.id === data.id);
    if (!row) return blocked(snapshot, "That adjustment is not on the file.");
    await sql`delete from tax_adjustments where id = ${data.id}`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const saveOfficerFn = createServerFn({ method: "POST" })
  .validator((input: { id?: string; entityId: string; role: "director" | "shareholder" | "secretary"; name: string; detail: string; appointed: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot edit the registers.");
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const name = data.name.trim();
    const detail = data.detail.trim();
    if (!name || !data.appointed) return blocked(snapshot, "Name and the date of appointment are required.");
    if (data.role !== "director" && data.role !== "shareholder" && data.role !== "secretary") return blocked(snapshot, "Unknown register.");
    if (data.id) {
      await sql`update company_officers set role = ${data.role}, name = ${name}, detail = ${detail}, appointed = ${data.appointed}
        where id = ${data.id} and entity_id = ${data.entityId}`;
    } else {
      await sql`insert into company_officers (id, entity_id, role, name, detail, appointed)
        values (${uid("of")}, ${data.entityId}, ${data.role}, ${name}, ${detail}, ${data.appointed})`;
    }
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'secretarial', ${`Register updated: ${data.role} ${name}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const removeOfficerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot edit the registers.");
    const officer = snapshot.officers.find((item) => item.id === data.id);
    if (!officer) return blocked(snapshot, "That person is not on the register.");
    await sql`delete from company_officers where id = ${data.id}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${officer.entityId}, 'secretarial', ${`Removed ${officer.role} ${officer.name}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const acceptProposalFn = createServerFn({ method: "POST" })
  .validator((input: {
    entityId: string;
    party: string;
    date: string;
    amount: number;
    debitAccountId: string;
    creditAccountId: string;
    rationale: string;
    source: string;
    documentId?: string;
  }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot accept a proposal. A preparer or partner has to.");
    if (!owns(snapshot, data.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const amount = round2(data.amount);
    const party = data.party.trim();
    if (!party || !data.date || !(amount > 0)) return blocked(snapshot, "Party, date, and amount are required.");
    if (!data.debitAccountId || !data.creditAccountId || data.debitAccountId === data.creditAccountId) {
      return blocked(snapshot, "Choose two different accounts.");
    }
    const known = new Set(snapshot.accounts.filter((account) => account.entityId === data.entityId).map((account) => account.id));
    if (!known.has(data.debitAccountId) || !known.has(data.creditAccountId)) return blocked(snapshot, "Those accounts are not on this company.");
    let voucher = `AI-${data.date.replace(/-/g, "")}`;
    let n = 2;
    while (snapshot.journals.some((journal) => journal.entityId === data.entityId && journal.voucherNumber === voucher)) {
      voucher = `AI-${data.date.replace(/-/g, "")}-${n}`;
      n += 1;
    }
    const posted = await postVoucher(sql, snapshot, {
      entityId: data.entityId,
      voucherNumber: voucher,
      date: data.date,
      reason: `Accepted proposal — ${party}`,
      lines: [
        { accountId: data.debitAccountId, debit: amount, credit: 0, description: party },
        { accountId: data.creditAccountId, debit: 0, credit: amount, description: party },
      ],
    });
    if (posted.error) return blocked(snapshot, posted.error);
    if (data.documentId && posted.journalId) {
      await sql`insert into evidence_links (id, document_id, journal_id)
        values (${uid("ev")}, ${data.documentId}, ${posted.journalId})
        on conflict (document_id, journal_id) do nothing`;
    }
    const source = data.source === "grok" ? "Grok" : "rules";
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${data.entityId}, 'proposal', ${`Accepted ${source} proposal ${voucher}. ${data.rationale.slice(0, 240)}`})`;
    return { error: null, voucher, snapshot: await readSnapshot(sql, scope) };
  });

export const refineProposalFn = createServerFn({ method: "POST" })
  .validator((input: { text: string; kind: string; accounts: { code: string; name: string; type: string }[] }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Grok drafting is not available until an API key is configured." };
    const chart = data.accounts.slice(0, 80).map((account) => `${account.code} ${account.name} (${account.type})`).join("\n");
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `You are a Hong Kong bookkeeper. From the invoice text, pick one debit account code and one credit account code from the chart. Kind: ${data.kind}. Reply with JSON only: {"debitCode":"","creditCode":"","confidence":"high|medium|low","rationale":""}.\n\nChart:\n${chart}\n\nInvoice:\n${data.text.slice(0, 4000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Grok could not draft the journal (${res.status}).` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false as const, error: "Grok did not return a journal." };
    try {
      const parsed = JSON.parse(match[0]) as { debitCode?: string; creditCode?: string; confidence?: string; rationale?: string };
      if (!parsed.debitCode || !parsed.creditCode) return { ok: false as const, error: "Grok did not name both accounts." };
      return {
        ok: true as const,
        debitCode: String(parsed.debitCode),
        creditCode: String(parsed.creditCode),
        confidence: parsed.confidence === "high" || parsed.confidence === "low" ? parsed.confidence : "medium",
        rationale: String(parsed.rationale ?? "Grok suggested these accounts.").slice(0, 500),
      };
    } catch {
      return { ok: false as const, error: "Grok returned text that could not be read." };
    }
  });

async function writePaper(sql: Awaited<ReturnType<typeof getSql>>, entityId: string, paper: EntityPaper) {
  const payload = JSON.stringify({
    notes: paper.notes,
    bankRules: paper.bankRules,
    csvMap: paper.csvMap,
    agmDate: paper.agmDate,
    resolutionDrafted: paper.resolutionDrafted,
    material: paper.material,
    waivers: paper.waivers,
    taxReviewed: paper.taxReviewed,
    allowanceNote: paper.allowanceNote,
    seenAt: paper.seenAt,
    thread: paper.thread,
    partyNotes: paper.partyNotes,
    reportLocked: paper.reportLocked,
    importMap: paper.importMap,
  });
  const [{ n }] = await sql<{ n: number }>`select count(*)::int as n from entity_papers where entity_id = ${entityId}`;
  if (n === 0) await sql`insert into entity_papers (entity_id, payload) values (${entityId}, ${payload})`;
  else await sql`update entity_papers set payload = ${payload} where entity_id = ${entityId}`;
}

export const savePaperFn = createServerFn({ method: "POST" })
  .validator((input: { paper: EntityPaper }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot change the working papers.");
    if (!owns(snapshot, data.paper.entityId)) return blocked(snapshot, "That company is not in your firm.");
    const paper = parsePaper(data.paper.entityId, JSON.stringify(data.paper));
    await writePaper(sql, paper.entityId, paper);
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const matchBankFn = createServerFn({ method: "POST" })
  .validator((input: { lineId: string; journalId: string }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot reconcile the bank.");
    const line = snapshot.bankLines.find((item) => item.id === data.lineId);
    if (!line || !owns(snapshot, line.entityId)) return blocked(snapshot, "That bank line is not on the file.");
    if (line.matchedJournalId) return blocked(snapshot, "That line is already reconciled.");
    const journal = snapshot.journals.find((item) => item.id === data.journalId && item.entityId === line.entityId);
    if (!journal) return blocked(snapshot, "That journal is not on this company.");
    const used = snapshot.bankLines.some((item) => item.matchedJournalId === journal.id);
    if (used) return blocked(snapshot, "That journal is already matched to another line.");
    const amount = round2(
      journal.lines.reduce((sum, entry) => {
        const account = snapshot.accounts.find((item) => item.id === entry.accountId);
        return account && accountFlow(account) === "cash" ? sum + entry.debit - entry.credit : sum;
      }, 0),
    );
    const window = snapshot.papers.find((item) => item.entityId === line.entityId)?.bankRules.some((rule) =>
      line.description.toLowerCase().includes(rule.toLowerCase()),
    )
      ? 14
      : 2;
    if (Math.abs(amount - line.amount) >= 0.02) return blocked(snapshot, "The amounts do not agree.");
    if (Math.abs(daysBetween(line.date, journal.date)) > window) return blocked(snapshot, "The dates are too far apart to match.");
    await sql`update bank_lines set matched_journal_id = ${journal.id} where id = ${line.id}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${line.entityId}, 'bank', ${`Matched ${line.description} to ${journal.voucherNumber}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

export const setAssetWdvFn = createServerFn({ method: "POST" })
  .validator((input: { assetId: string; taxWdv: number }) => input)
  .handler(async ({ data }) => {
    const { sql, scope, snapshot } = await scopeOf();
    if (snapshot.role === "reviewer") return blocked(snapshot, "A reviewer cannot change the tax computation.");
    const asset = snapshot.assets.find((item) => item.id === data.assetId);
    if (!asset || !owns(snapshot, asset.entityId)) return blocked(snapshot, "That asset is not on the file.");
    const taxWdv = round2(data.taxWdv);
    if (!(taxWdv >= 0)) return blocked(snapshot, "The tax written-down value cannot be negative.");
    await sql`update fixed_assets set tax_wdv = ${taxWdv} where id = ${asset.id}`;
    await sql`insert into audit_events (id, entity_id, action, detail)
      values (${uid("au")}, ${asset.entityId}, 'tax', ${`Opening tax written-down value for ${asset.name} set to ${taxWdv.toFixed(2)}`})`;
    return { error: null, snapshot: await readSnapshot(sql, scope) };
  });

