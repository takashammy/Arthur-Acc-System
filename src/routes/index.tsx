import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { chartTooltip, DateRange } from "@/components/date-range";
import { go } from "@/lib/accounting/nav";
import { useLedger } from "@/lib/accounting/store";
import { statements, tbTotals, trialBalance } from "@/lib/accounting/model";
import { monthlyResult } from "@/lib/accounting/glance";
import { bookAnomalies } from "@/lib/accounting/anomalies";
import { formatHkd, axisTick } from "@/lib/accounting/money";
import { emptyPaper } from "@/lib/accounting/ledger.functions";
import { downloadAuditFile } from "@/lib/accounting/audit-pack";
import { yearEndIso, yearStartIso, daysBetween } from "@/lib/accounting/subledger";
import { periodChecks } from "@/lib/accounting/checklist";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/")({ component: Home });

export function Home() {
  const entityId = useLedger((s) => s.activeEntityId);
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const yearEnd = yearEndIso(entity?.yearEnd ?? "31 Mar 2026");
  const yearStart = yearStartIso(yearEnd);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(yearEnd);
  const periodRows = useMemo(
    () => trialBalance(accounts, journals, entityId, { from, to }),
    [accounts, journals, entityId, from, to],
  );
  const asAtRows = useMemo(
    () => trialBalance(accounts, journals, entityId, { to }),
    [accounts, journals, entityId, to],
  );
  const period = statements(periodRows);
  const position = statements(asAtRows);
  const totals = tbTotals(asAtRows);
  const mine = journals.filter((j) => j.entityId === entityId);
  const months = useMemo(() => monthlyResult(accounts, journals, entityId, from, to), [accounts, journals, entityId, from, to]);
  const findings = useMemo(() => bookAnomalies(accounts, journals, entityId, to), [accounts, journals, entityId, to]);
  const cash = asAtRows.filter((row) => /cash|bank/i.test(row.account.name)).reduce((sum, row) => sum + row.balance, 0);
  const receivables = asAtRows.filter((row) => /receivable/i.test(row.account.name)).reduce((sum, row) => sum + row.balance, 0);
  const payables = asAtRows.filter((row) => /payable/i.test(row.account.name)).reduce((sum, row) => sum + Math.abs(row.balance), 0);
  const hydrated = useLedger((s) => s.hydrated);
  const error = useLedger((s) => s.error);
  const audit = useLedger((s) => s.audit);
  const bankLines = useLedger((s) => s.bankLines);
  const links = useLedger((s) => s.links);
  const invoices = useLedger((s) => s.invoices);
  const settlements = useLedger((s) => s.settlements);
  const assets = useLedger((s) => s.assets);
  const requests = useLedger((s) => s.requests);
  const reviews = useLedger((s) => s.reviews);
  const addCompany = useLedger((s) => s.addCompany);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const setEntity = useLedger((s) => s.setEntity);
  const allEntities = useLedger((s) => s.entities);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const review = reviews.find((item) => item.entityId === entityId);
  const [name, setName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [yearEndChoice, setYearEndChoice] = useState("31 Mar 2026");
  const [incorporated, setIncorporated] = useState("");
  const [office, setOffice] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [auditAction, setAuditAction] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");

  useEffect(() => {
    if (!entityId || typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(`arthur.range.${entityId}`);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { from?: string; to?: string };
      if (saved.from && saved.to) {
        setFrom(saved.from);
        setTo(saved.to);
      }
    } catch {
      /* keep the year */
    }
  }, [entityId]);

  useEffect(() => {
    if (!entityId || typeof localStorage === "undefined") return;
    localStorage.setItem(`arthur.range.${entityId}`, JSON.stringify({ from, to }));
  }, [entityId, from, to]);

  return (<>
      <PageTitle
        kicker="Working papers"
        title="Books in balance."
        detail="Posted journals only. A voucher is accepted only if it balances and the period is open."
      />
      {error ? <p className="mb-4 text-sm text-seal">{error}</p> : null}
      {!hydrated ? <p className="text-sm text-muted">Loading the books…</p> : null}
      <DateRange from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Result for the period" value={formatHkd(period.incomeTotal)} tone={period.incomeTotal < 0 ? "seal" : "pine"} to="/reports" />
        <Stat label="Cash at bank" value={formatHkd(cash)} hint={bankLines.filter((line) => line.entityId === entityId && !line.matchedJournalId).length ? `${bankLines.filter((line) => line.entityId === entityId && !line.matchedJournalId).length} unmatched` : "Reconciled"} to="/bank" />
        <Stat label="Trade receivables" value={formatHkd(receivables)} to="/ledgers" />
        <Stat label="Trade payables" value={formatHkd(payables)} to="/ledgers" />
        <Stat label="Net assets" value={formatHkd(position.netAssets)} to="/reports" />
        <Stat label="Posted vouchers" value={String(mine.length)} plain to="/journals" />
        <Stat
          label="Trial balance"
          value={Math.abs(totals.debit - totals.credit) < 0.02 ? "Agrees" : "Out of balance"}
          tone="pine"
          plain
        />
        <Stat label="Review status" value={review?.status ?? (hydrated ? "Draft" : "…")} tone="pine" plain />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-card border border-line bg-panel p-4">
          <h2 className="font-serif text-xl">Monthly result</h2>
          <p className="mt-1 text-sm text-muted">Sales, costs and the result for each month in the range.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--chart-tick)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={axisTick} />
                <Tooltip formatter={(value) => formatHkd(Number(value))} {...chartTooltip} />
                <Legend wrapperStyle={{ color: "var(--color-ink)" }} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="var(--chart-a)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="costs" name="Costs" stroke="var(--chart-b)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="result" name="Result" stroke="var(--chart-c)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="rounded-card border border-line bg-panel p-4">
          <h2 className="font-serif text-xl">Integrity checks</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <Check ok={Math.abs(totals.debit - totals.credit) < 0.02} label="Debits equal credits" />
            <Check ok={position.balanced} label="Assets − liabilities = equity" />
            <Check ok label="Reports reflect posted journals only" />
            <Check ok={mine.every((j) => j.lines.length >= 2)} label="Every voucher has at least two lines" />
            {findings.map((item) => (
              <Check key={item.message} ok={item.level !== "warn"} label={item.message} />
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => go("/journals")} className="inline-flex min-h-11 items-center rounded-lg bg-pine px-4 text-sm text-panel">
              Post a journal entry
            </button>
            <button type="button" onClick={() => go("/import")} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm">
              Import journals
            </button>
          </div>
        </article>
      </section>

      <Attention
        items={[
          ...(Math.abs(totals.debit - totals.credit) >= 0.02 ? [{ label: "Trial balance is out of balance", to: "/reports" }] : []),
          ...(() => {
            const count = bankLines.filter((line) => line.entityId === entityId && !line.matchedJournalId).length;
            return count ? [{ label: `${count} unmatched bank line${count === 1 ? "" : "s"}`, to: "/bank" }] : [];
          })(),
          ...requests.filter((item) => item.entityId === entityId && item.status === "open").map((item) => ({ label: `Client request: ${item.title}`, to: "/review" })),
          ...(review && ["signed", "released"].includes(review.status) ? [] : [{ label: `Review is ${review?.status ?? "draft"}`, to: "/review" }]),
          ...(!paper.taxReviewed ? [{ label: "Profits tax computation is not marked reviewed", to: "/tax" }] : []),
          ...periodChecks({
            accounts,
            journals,
            entityId,
            yearEndLabel: entity?.yearEnd ?? "31 Mar 2026",
            bankLines,
            links,
            invoices,
            settlements,
            assets,
          }).filter((item) => !item.ok && !paper.waivers.includes(item.label)).map((item) => ({ label: item.label, to: "/close" })),
        ]}
      />

      <section className="mt-6 rounded-card border border-line bg-panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl">Practice</h2>
          <button
            type="button"
            className="text-sm text-pine"
            onClick={() =>
              downloadAuditFile({
                entityName: entity?.name ?? "Company",
                accounts,
                journals,
                documents: useLedger.getState().documents.filter((item) => item.entityId === entityId),
                links,
                entityId,
                audit: audit.filter((event) => !event.entityId || event.entityId === entityId),
              })
            }
          >
            Export the audit file
          </button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {allEntities.map((item) => {
            const unmatched = bankLines.filter((line) => line.entityId === item.id && !line.matchedJournalId).length;
            const waiting = requests.filter((request) => request.entityId === item.id && request.status === "open").length;
            const status = reviews.find((entry) => entry.entityId === item.id)?.status ?? "draft";
            return (
              <li key={item.id}>
                <button type="button" className="text-left hover:underline" onClick={() => setEntity(item.id)}>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted"> · {status} · {unmatched} unmatched · {waiting} requests</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">Since you last looked</h3>
            <button type="button" className="text-sm text-pine" onClick={() => void savePaper({ ...paper, entityId, seenAt: new Date().toISOString() })}>
              Mark as seen
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {audit.filter((event) => (!event.entityId || event.entityId === entityId) && paper.seenAt && event.createdAt > paper.seenAt).slice(0, 8).map((event) => (
              <li key={event.id}><span className="text-muted">{event.action}</span> — {event.detail}</li>
            ))}
            {!paper.seenAt ? <li className="text-muted">Mark the file as seen, and later changes will list here. {daysBetween(yearStart, to)} days are in the current range.</li> : null}
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-card border border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Open a company</h2>
        <p className="mt-1 text-sm text-muted">Adds the company to the practice, with an open period and a Hong Kong trading chart of accounts.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Company name" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input value={crNumber} onChange={(event) => setCrNumber(event.target.value)} placeholder="CR number" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <select value={yearEndChoice} onChange={(event) => setYearEndChoice(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
            <option>31 Mar 2026</option>
            <option>31 Dec 2025</option>
            <option>30 Jun 2026</option>
            <option>30 Sep 2026</option>
          </select>
          <input type="date" value={incorporated} onChange={(event) => setIncorporated(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input value={office} onChange={(event) => setOffice(event.target.value)} placeholder="Registered office" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm sm:col-span-2" />
        </div>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
          onClick={() =>
            void addCompany({ name, crNumber, yearEnd: yearEndChoice, incorporated, registeredOffice: office }).then((message) => {
              setOpened(message ?? `${name} opened.`);
              if (!message) {
                setName("");
                setCrNumber("");
                setOffice("");
              }
            })
          }
        >
          Add company
        </button>
        {opened ? <p className="mt-2 text-sm text-pine">{opened}</p> : null}
      </section>

      <section className="mt-6 overflow-hidden rounded-card border border-line bg-panel">
        <div className="flex items-baseline justify-between px-4 py-3">
          <h2 className="font-serif text-xl">Latest journals</h2>
          <button type="button" onClick={() => go("/reports")} className="text-sm text-pine">
            View reports
          </button>
        </div>
        <ul>
          {mine
            .slice()
            .reverse()
            .slice(0, 5)
            .map((journal) => (
              <li key={journal.id} className="grid grid-cols-[7.5rem_1fr_auto] gap-3 border-t border-line px-4 py-3 text-sm">
                <span className="tabular text-muted">{journal.date}</span>
                <span>
                  <span className="font-medium">{journal.voucherNumber}</span>
                  <span className="text-muted"> — {journal.reason}</span>
                </span>
                <span className="tabular">
                  {formatHkd(journal.lines.reduce((s, l) => s + l.debit, 0))}
                </span>
              </li>
            ))}
        </ul>
      </section>
      <section className="mt-6 overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Audit log</h2>
        <div className="grid gap-2 border-t border-line px-4 py-3 sm:grid-cols-3">
          <select value={auditAction} onChange={(event) => setAuditAction(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm">
            <option value="">All actions</option>
            {[...new Set(audit.map((event) => event.action))].map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
          <input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        </div>
        <ul>
          {audit.filter((event) => {
            if (event.entityId && event.entityId !== entityId) return false;
            if (auditAction && event.action !== auditAction) return false;
            const day = event.createdAt.slice(0, 10);
            if (auditFrom && day < auditFrom) return false;
            if (auditTo && day > auditTo) return false;
            return true;
          }).map((event) => (
            <li key={event.id} className="border-t border-line px-4 py-2 text-sm">
              <span className="text-muted">{event.createdAt.slice(0, 10)} · {event.action}</span> — {event.detail}
            </li>
          ))}
        </ul>
      </section>
  </>);
}

function Attention({ items }: { items: { label: string; to: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6 rounded-card border border-line bg-panel p-4">
      <h2 className="font-serif text-xl">Still open</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <button type="button" className="flex items-start gap-2 text-left text-seal" onClick={() => go(item.to)}>
              <span className="mt-1 size-2 shrink-0 rounded-full bg-seal" />
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  plain,
  tone,
  hint,
  to,
}: {
  label: string;
  value: string;
  plain?: boolean;
  tone?: "pine" | "seal";
  hint?: string;
  to?: string;
}) {
  return (<>
    <article className="rounded-card border border-line bg-panel px-4 py-3">
      <button type="button" className="w-full text-left" onClick={() => to && go(to)}>
      <p className="text-[11px] tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className={`mt-2 font-serif text-2xl tabular ${tone === "seal" ? "text-seal" : tone === "pine" ? "text-pine" : ""} ${plain ? "" : ""}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </button>
    </article>
  </>);
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (<>
    <li className="flex items-start gap-2">
      <span className={`mt-1 size-2 shrink-0 rounded-full ${ok ? "bg-pine" : "bg-seal"}`} />
      <span>{label}</span>
    </li>
  </>);
}
