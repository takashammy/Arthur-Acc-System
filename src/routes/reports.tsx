import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { AsAt, chartTooltip, DateRange } from "@/components/date-range";
import { statements, tbTotals, trialBalance, cashFlow, type StatementLine } from "@/lib/accounting/model";
import { balanceComposition, monthlyResult } from "@/lib/accounting/glance";
import { useLedger } from "@/lib/accounting/store";
import { formatHkd, axisTick, round2 } from "@/lib/accounting/money";
import { emptyPaper } from "@/lib/accounting/ledger.functions";
import { yearEndIso, yearStartIso, shiftIso } from "@/lib/accounting/subledger";
import { downloadManagementPack } from "@/lib/accounting/export-pack";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type Tab = "tb" | "pl" | "bs" | "cf";

export function ReportsPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const yearEnd = yearEndIso(entity?.yearEnd ?? "31 Mar 2026");
  const yearStart = yearStartIso(yearEnd);
  const [tab, setTab] = useState<Tab>("tb");
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(yearEnd);
  const [asAt, setAsAt] = useState(yearEnd);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [noteState, setNoteState] = useState<string | null>(null);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const priorAsAt = shiftIso(asAt, -1);
  const prior2AsAt = shiftIso(asAt, -2);
  const priorFrom = shiftIso(from, -1);
  const priorTo = shiftIso(to, -1);
  const priorPeriodRows = useMemo(
    () => trialBalance(accounts, journals, entityId, { from: priorFrom, to: priorTo, excludeClose: true }),
    [accounts, journals, entityId, priorFrom, priorTo],
  );
  const priorAsAtRows = useMemo(
    () => trialBalance(accounts, journals, entityId, { to: priorAsAt }),
    [accounts, journals, entityId, priorAsAt],
  );
  const prior2AsAtRows = useMemo(
    () => trialBalance(accounts, journals, entityId, { to: prior2AsAt }),
    [accounts, journals, entityId, prior2AsAt],
  );
  const periodRows = useMemo(() => trialBalance(accounts, journals, entityId, { from, to, excludeClose: true }), [accounts, journals, entityId, from, to]);
  const asAtRows = useMemo(() => trialBalance(accounts, journals, entityId, { to: asAt }), [accounts, journals, entityId, asAt]);
  const period = statements(periodRows);
  const position = statements(asAtRows);
  const priorPeriod = statements(priorPeriodRows);
  const priorPosition = statements(priorAsAtRows);
  const periodTotals = tbTotals(periodRows);
  const asAtTotals = tbTotals(asAtRows);
  const flow = cashFlow(periodRows, period.incomeTotal);
  const months = useMemo(() => monthlyResult(accounts, journals, entityId, from, to), [accounts, journals, entityId, from, to]);
  const composition = useMemo(() => balanceComposition(accounts, journals, entityId, asAt), [accounts, journals, entityId, asAt]);
  const compositionChart = [
    { name: "Non-current assets", amount: composition.nonCurrent },
    { name: "Current assets", amount: composition.current },
    { name: "Liabilities", amount: composition.liabilities },
    { name: "Equity", amount: composition.equity },
  ];

  function pickLine(line: StatementLine) {
    const account = accounts.find((item) => item.entityId === entityId && item.code === line.code && item.name === line.name);
    if (!account) return;
    setFocusId(account.id);
    setDraftNote(paper.notes[account.id] ?? "");
  }

  const focusAccount = accounts.find((item) => item.id === focusId);
  const focusFrom = tab === "pl" || tab === "cf" ? from : undefined;
  const focusTo = tab === "tb" || tab === "bs" ? asAt : to;
  const focusJournals = journals.filter((journal) => {
    if (!focusId || journal.entityId !== entityId) return false;
    if (focusFrom && journal.date < focusFrom) return false;
    if (focusTo && journal.date > focusTo) return false;
    return journal.lines.some((line) => line.accountId === focusId);
  });

  return (<>
      <PageTitle
        kicker="Management accounts"
        title="Posted journals only."
        detail="Draft journals are excluded. Current-year profit or loss is shown separately from opening equity."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["tb", "Trial balance"],
            ["pl", "Profit and loss"],
            ["bs", "Balance sheet"],
            ["cf", "Cash flow"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-full px-4 text-sm ${tab === id ? "bg-ink text-panel" : "border border-line bg-panel"}`}
          >
            {label}
          </button>
        ))}
          <button
          type="button"
          onClick={() =>
            downloadManagementPack({
              entityName: entity?.name ?? "Entity",
              period: entity?.yearEnd ?? "FY",
              rows: asAtRows,
              report: position,
              flow,
              locked: paper.reportLocked,
              notes: Object.entries(paper.notes).map(([id, note]) => {
                const account = accounts.find((item) => item.id === id);
                return { account: account ? `${account.code} ${account.name}` : id, note };
              }),
            })
          }
          className="min-h-11 rounded-full bg-pine px-4 text-sm text-panel"
        >
          Export management accounts
        </button>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Material</span>
          <input
            inputMode="decimal"
            value={String(paper.material)}
            onChange={(event) => void savePaper({ ...paper, entityId, material: Math.max(0, Number(event.target.value) || 0) })}
            className="min-h-11 w-28 rounded-lg border border-line bg-panel px-2 text-right tabular"
          />
        </label>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line px-4 text-sm"
          onClick={() => void savePaper({ ...paper, entityId, reportLocked: !paper.reportLocked })}
        >
          {paper.reportLocked ? "Unlock the issued set" : "Lock this set for issue"}
        </button>
      </div>
      {paper.reportLocked ? <p className="mb-4 text-sm text-brass">This report set is marked locked for issue. The export says so. Unlock it before you treat a later draft as the issued set.</p> : null}

      {tab === "tb" ? (
        <>
          <AsAt value={asAt} onChange={setAsAt} />
          <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-[11px] tracking-[0.14em] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Credit</th>
                <th className="px-4 py-3 text-right font-medium">Prior year net</th>
                <th className="px-4 py-3 text-right font-medium">Two years prior</th>
              </tr>
            </thead>
            <tbody>
              {asAtRows.map((row) => (
                <tr key={row.account.id} className="border-t border-line">
                  <td className="px-4 py-2 tabular text-muted">{row.account.code}</td>
                  <td className="px-4 py-2">
                    <button type="button" className="text-left hover:underline" onClick={() => { setFocusId(row.account.id); setDraftNote(paper.notes[row.account.id] ?? ""); }}>
                      {row.account.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right tabular">{row.debit ? formatHkd(row.debit) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular">{row.credit ? formatHkd(row.credit) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular text-muted">
                    {formatHkd(priorAsAtRows.find((prior) => prior.account.id === row.account.id)?.balance ?? 0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular text-muted">
                    {formatHkd(prior2AsAtRows.find((prior) => prior.account.id === row.account.id)?.balance ?? 0)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="px-4 py-3" colSpan={2}>
                  {Math.abs(asAtTotals.debit - asAtTotals.credit) < 0.02 ? "In balance" : "Out of balance"}
                </td>
                <td className="px-4 py-3 text-right tabular">{formatHkd(asAtTotals.debit)}</td>
                <td className="px-4 py-3 text-right tabular">{formatHkd(asAtTotals.credit)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
          </div>
        </>
      ) : null}

      {tab === "pl" ? (
        <>
          <DateRange from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
          <article className="mb-4 rounded-card border border-line bg-panel p-4">
            <h2 className="font-serif text-xl">Monthly profit and loss</h2>
            <div className="mt-4 h-56">
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
          <Statement
            title="Profit and loss"
            lines={period.income}
            prior={priorPeriod.income}
            showVariance
            material={paper.material}
            onSelect={(line) => pickLine(line)}
            totalLabel={period.incomeTotal >= 0 ? "Profit" : "Loss"}
            total={period.incomeTotal}
            priorTotal={priorPeriod.incomeTotal}
          />
        </>
      ) : null}

      {tab === "bs" ? (
        <>
          <AsAt value={asAt} onChange={setAsAt} label="Balance sheet as at" />
          <article className="mb-4 rounded-card border border-line bg-panel p-4">
            <h2 className="font-serif text-xl">Composition</h2>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compositionChart}>
                  <XAxis dataKey="name" tick={{ fill: "var(--chart-tick)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={axisTick} />
                  <Tooltip formatter={(value) => formatHkd(Number(value))} {...chartTooltip} />
                  <Bar dataKey="amount" name="Amount" fill="var(--chart-a)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <div className="grid gap-4 lg:grid-cols-2">
            <Statement title="Assets" lines={position.assets} prior={priorPosition.assets} onSelect={(line) => pickLine(line)} totalLabel="Total assets" total={position.assetTotal} priorTotal={priorPosition.assetTotal} />
            <div className="space-y-4">
              <Statement title="Liabilities" lines={position.liabilities} prior={priorPosition.liabilities} onSelect={(line) => pickLine(line)} totalLabel="Total liabilities" total={position.liabilityTotal} priorTotal={priorPosition.liabilityTotal} />
              <Statement title="Equity" lines={position.equity} prior={priorPosition.equity} onSelect={(line) => pickLine(line)} totalLabel="Total equity" total={position.equityTotal} priorTotal={priorPosition.equityTotal} />
              <p className={`rounded-card border border-line px-4 py-3 text-sm ${position.balanced ? "bg-pine-soft text-pine" : "bg-warn-bg text-seal"}`}>
                Net assets {formatHkd(position.netAssets)}. {position.balanced ? "The balance sheet agrees." : "The balance sheet does not agree. Do not issue these accounts."}
              </p>
            </div>
          </div>
        </>
      ) : null}

      {tab === "cf" ? (
        <>
          <DateRange from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
          <div className="space-y-4">
            <Statement title="Operating activities" lines={[{ code: "", name: "Profit / (loss)", amount: flow.profit }, ...flow.operating]} onSelect={(line) => pickLine(line)} totalLabel="Net cash from operating activities" total={flow.operatingTotal} />
            <Statement title="Investing activities" lines={flow.investing} onSelect={(line) => pickLine(line)} totalLabel="Net cash from investing activities" total={flow.investingTotal} />
            <Statement title="Financing activities" lines={flow.financing} onSelect={(line) => pickLine(line)} totalLabel="Net cash from financing activities" total={flow.financingTotal} />
            <p className={`rounded-card border border-line px-4 py-3 text-sm ${flow.ties ? "bg-pine-soft text-pine" : "bg-warn-bg text-seal"}`}>
              Net increase in cash {formatHkd(flow.net)}. Cash movement {formatHkd(flow.cashMovement)}.{" "}
              {flow.ties ? "The cash flow statement agrees to cash at bank." : "The cash flow statement does not agree to cash at bank. Do not issue these accounts."}
            </p>
          </div>
        </>
      ) : null}
      {focusAccount ? (
        <section className="mt-4 rounded-card border border-line bg-panel p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl">{focusAccount.code} {focusAccount.name}</h2>
            <button type="button" className="text-sm text-muted" onClick={() => setFocusId(null)}>Close</button>
          </div>
          <p className="mt-1 text-sm text-muted">{focusJournals.length} journal{focusJournals.length === 1 ? "" : "s"} in the range.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {focusJournals.map((journal) => {
              const line = journal.lines.find((item) => item.accountId === focusId);
              const movement = (line?.debit ?? 0) - (line?.credit ?? 0);
              return (
                <li key={journal.id} className="flex justify-between gap-3 py-2">
                  <span>{journal.date} · {journal.voucherNumber} · {journal.reason}</span>
                  <span className="tabular">{formatHkd(movement)}</span>
                </li>
              );
            })}
          </ul>
          <label className="mt-3 block text-sm">
            <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Working paper note</span>
            <textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" />
          </label>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-lg border border-line px-4 text-sm"
            onClick={() => {
              if (!focusId) return;
              const notes = { ...paper.notes };
              if (draftNote.trim()) notes[focusId] = draftNote.trim();
              else delete notes[focusId];
              void savePaper({ ...paper, entityId, notes }).then((error) => setNoteState(error ?? "Note saved on the file."));
            }}
          >
            Save note
          </button>
          {noteState ? <p className="mt-2 text-sm text-muted">{noteState}</p> : null}
        </section>
      ) : null}
  </>);
}

function Statement({
  title,
  lines,
  prior,
  totalLabel,
  total,
  priorTotal,
  showVariance,
  material,
  onSelect,
}: {
  title: string;
  lines: StatementLine[];
  prior?: StatementLine[];
  totalLabel: string;
  total: number;
  priorTotal?: number;
  showVariance?: boolean;
  material?: number;
  onSelect?: (line: StatementLine) => void;
}) {
  const priorAmount = (line: StatementLine) =>
    prior?.find((item) => item.code === line.code && item.name === line.name)?.amount;
  return (<>
    <section className="overflow-hidden rounded-card border border-line bg-panel">
      <h2 className="px-4 py-3 font-serif text-xl">{title}</h2>
      <table className="w-full text-sm">
        {prior ? (
          <thead className="text-[11px] tracking-[0.14em] text-muted uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-medium" colSpan={2}>This year</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-right font-medium">Prior year</th>
              {showVariance ? <th className="px-4 py-2 text-right font-medium">Variance</th> : null}
              {showVariance ? <th className="px-4 py-2 text-right font-medium">%</th> : null}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {lines.map((line) => {
            const priorAmt = priorAmount(line) ?? 0;
            const variance = round2(line.amount - priorAmt);
            const pct = Math.abs(priorAmt) < 0.005 ? null : round2((variance / Math.abs(priorAmt)) * 100);
            const materialMove = material != null && Math.abs(variance) >= material;
            return (
            <tr key={line.code + line.name} className={`border-t border-line ${materialMove ? "bg-warn-bg" : ""}`}>
              <td className="px-4 py-2 text-muted tabular">{line.code}</td>
              <td className="px-4 py-2">
                {onSelect && line.code ? (
                  <button type="button" className="text-left hover:underline" onClick={() => onSelect(line)}>{line.name}</button>
                ) : line.name}
              </td>
              <td className={`px-4 py-2 text-right tabular ${line.amount < 0 ? "text-seal" : ""}`}>{formatHkd(line.amount)}</td>
              {prior ? (
                <td className="px-4 py-2 text-right tabular text-muted">{formatHkd(priorAmt)}</td>
              ) : null}
              {showVariance ? <td className={`px-4 py-2 text-right tabular ${variance < 0 ? "text-seal" : ""}`}>{formatHkd(variance)}</td> : null}
              {showVariance ? <td className="px-4 py-2 text-right tabular text-muted">{pct == null ? "—" : `${pct.toFixed(0)}%`}</td> : null}
            </tr>
            );
          })}
          <tr className="border-t border-line font-medium">
            <td className="px-4 py-3" colSpan={2}>
              {totalLabel}
            </td>
            <td className={`px-4 py-3 text-right tabular ${total < 0 ? "text-seal" : ""}`}>{formatHkd(total)}</td>
            {prior ? <td className="px-4 py-3 text-right tabular text-muted">{formatHkd(priorTotal ?? 0)}</td> : null}
            {showVariance ? <td className="px-4 py-3 text-right tabular">{formatHkd(round2(total - (priorTotal ?? 0)))}</td> : null}
            {showVariance ? <td /> : null}
          </tr>
        </tbody>
      </table>
    </section>
  </>);
}
