import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { useLedger } from "@/lib/accounting/store";
import { statements, tbTotals, trialBalance } from "@/lib/accounting/model";
import { formatHkd } from "@/lib/accounting/money";
import { ageInvoices, workAssets, yearEndIso, yearStartIso } from "@/lib/accounting/subledger";
import { closingLines } from "@/lib/accounting/close";
import { bookAnomalies } from "@/lib/accounting/anomalies";
import { periodChecks } from "@/lib/accounting/checklist";
import { emptyPaper } from "@/lib/accounting/ledger.functions";

export const Route = createFileRoute("/close")({ component: ClosePage });

export function ClosePage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const bankLines = useLedger((s) => s.bankLines);
  const links = useLedger((s) => s.links);
  const allInvoices = useLedger((s) => s.invoices);
  const allSettlements = useLedger((s) => s.settlements);
  const allAssets = useLedger((s) => s.assets);
  const invoices = useMemo(() => allInvoices.filter((item) => item.entityId === entityId), [allInvoices, entityId]);
  const invoiceIds = useMemo(() => new Set(invoices.map((item) => item.id)), [invoices]);
  const settlements = useMemo(
    () => allSettlements.filter((item) => invoiceIds.has(item.invoiceId)),
    [allSettlements, invoiceIds],
  );
  const assets = useMemo(() => allAssets.filter((item) => item.entityId === entityId), [allAssets, entityId]);
  const closeYear = useLedger((s) => s.closeYear);
  const role = useLedger((s) => s.role);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const yearEnd = yearEndIso(entity?.yearEnd ?? "31 Mar 2026");
  const yearStart = yearStartIso(yearEnd);
  const asOf = yearEnd;
  const rows = trialBalance(accounts, journals, entityId, { from: yearStart, to: yearEnd, excludeClose: true });
  const positionRows = trialBalance(accounts, journals, entityId, { to: yearEnd });
  const totals = tbTotals(positionRows);
  const report = statements(positionRows);
  const worked = workAssets(assets, entity?.yearEnd ?? "31 Mar 2026");
  const tbOk = Math.abs(totals.debit - totals.credit) < 0.02;
  const checks = periodChecks({
    accounts,
    journals,
    entityId,
    yearEndLabel: entity?.yearEnd ?? "31 Mar 2026",
    bankLines,
    links,
    invoices: allInvoices,
    settlements: allSettlements,
    assets: allAssets,
  });
  const retained = accounts.find((account) => account.entityId === entityId && (account.code === "3100" || /retained/i.test(account.name)));
  const preview = closingLines(rows, { id: retained?.id ?? "retained", name: retained?.name ?? "Retained earnings" });
  const findings = bookAnomalies(accounts, journals, entityId, yearEnd);
  const already = journals.some((journal) => journal.entityId === entityId && journal.voucherNumber === `YE-${yearEnd.slice(0, 4)}`);
  const blocking = checks.filter((check) => check.critical && !check.ok && !paper.waivers.includes(check.label));

  return (<>
      <PageTitle
        kicker="Period close"
        title="Do not lock a period that does not agree."
        detail={`The year in view ends ${yearEnd}. Closing transfers the result into retained earnings and opens the next year. Ageing is measured to that date.`}
      />
      {findings.length ? (
        <ul className="mb-4 space-y-2">
          {findings.map((item) => (
            <li key={item.message} className={`rounded-card border border-line px-4 py-3 text-sm ${item.level === "warn" ? "text-seal" : "text-muted"}`}>
              {item.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-pine">No reasonableness warnings on the books to {yearEnd}.</p>
      )}
      <section className="mb-6 rounded-card border border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Year-end close</h2>
        <p className="mt-1 text-sm text-muted">
          Result for the year {formatHkd(preview.profit)}. The next year opens with these balance-sheet balances. Income accounts are cleared.
          {role !== "partner" ? " Only a partner can post the close." : ""}
        </p>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.accountId + line.description} className="border-t border-line">
                <td className="py-2">{line.name}</td>
                <td className="py-2 text-right tabular">{line.debit ? formatHkd(line.debit) : ""}</td>
                <td className="py-2 text-right tabular">{line.credit ? formatHkd(line.credit) : ""}</td>
              </tr>
            ))}
            {preview.lines.length === 0 ? (
              <tr>
                <td className="py-2 text-muted">No profit or loss to transfer.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <button
          type="button"
          disabled={busy || role !== "partner" || already || !tbOk || !report.balanced || blocking.length > 0}
          className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            void closeYear(entityId).then((error) => {
              setNote(error ?? `Closed. Result ${formatHkd(preview.profit)} is in retained earnings, and the next year is open.`);
              setBusy(false);
            });
          }}
        >
          {already ? "This year is already closed" : blocking.length ? "Clear or waive the critical checks" : !tbOk || !report.balanced ? "Books do not agree" : busy ? "Closing…" : "Post the close and open the next year"}
        </button>
        {note ? <p className="mt-2 text-sm text-pine">{note}</p> : null}
      </section>
      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.label} className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-panel px-4 py-3 text-sm">
            <span className={`size-2 rounded-full ${check.ok || paper.waivers.includes(check.label) ? "bg-pine" : "bg-seal"}`} />
            <span className="flex-1">{check.label}{check.critical ? "" : ""}{paper.waivers.includes(check.label) ? " · waived" : ""}</span>
            {!check.ok && role === "partner" ? (
              <button
                type="button"
                className="min-h-8 rounded-lg border border-line px-2 text-xs"
                onClick={() => {
                  const waivers = paper.waivers.includes(check.label)
                    ? paper.waivers.filter((item) => item !== check.label)
                    : [...paper.waivers, check.label];
                  void savePaper({ ...paper, entityId, waivers });
                }}
              >
                {paper.waivers.includes(check.label) ? "Restore" : "Waive"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Ageing title="Trade receivables" rows={ageInvoices(invoices, settlements, "receivable", asOf)} />
        <Ageing title="Trade payables" rows={ageInvoices(invoices, settlements, "payable", asOf)} />
      </div>
      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Fixed assets</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-line text-left text-muted">
              <th className="px-4 py-2 font-normal">Asset</th>
              <th className="px-4 py-2 text-right font-normal">Cost</th>
              <th className="px-4 py-2 text-right font-normal">Depreciation</th>
              <th className="px-4 py-2 text-right font-normal">Capital allowance</th>
              <th className="px-4 py-2 text-right font-normal">Net book value</th>
            </tr>
          </thead>
          <tbody>
            {worked.map((row) => (
              <tr key={row.asset.id} className="border-t border-line">
                <td className="px-4 py-2">{row.asset.name}</td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(row.asset.cost)}</td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(row.depreciation)}</td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(row.allowance)}</td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(row.nbv)}</td>
              </tr>
            ))}
            {worked.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-sm text-muted" colSpan={5}>
                  No assets on the register.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
  </>);
}

function Ageing({ title, rows }: { title: string; rows: [string, number][] }) {
  return (<>
    <section className="overflow-hidden rounded-card border border-line bg-panel">
      <h2 className="px-4 py-3 font-serif text-xl">{title}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([name, amount]) => (
            <tr key={name} className="border-t border-line">
              <td className="px-4 py-2">{name} days</td>
              <td className="px-4 py-2 text-right tabular">{formatHkd(amount)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-muted">Nothing outstanding.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  </>);
}