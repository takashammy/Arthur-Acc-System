import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { downloadBir51 } from "@/lib/accounting/export-returns";
import { downloadText } from "@/lib/accounting/filings";
import { profitsTax, taxNarrative } from "@/lib/accounting/tax";
import { trialBalance } from "@/lib/accounting/model";
import { useLedger } from "@/lib/accounting/store";
import { formatHkd, round2 } from "@/lib/accounting/money";
import { workAssets } from "@/lib/accounting/subledger";
import { emptyPaper } from "@/lib/accounting/ledger.functions";

export const Route = createFileRoute("/tax")({ component: TaxPage });

export function TaxPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const allAssets = useLedger((s) => s.assets);
  const assets = useMemo(() => allAssets.filter((item) => item.entityId === entityId), [allAssets, entityId]);
  const allAdjustments = useLedger((s) => s.taxAdjustments);
  const adjustments = useMemo(() => allAdjustments.filter((item) => item.entityId === entityId), [allAdjustments, entityId]);
  const saveAdjustment = useLedger((s) => s.saveAdjustment);
  const removeAdjustment = useLedger((s) => s.removeAdjustment);
  const setAssetWdv = useLedger((s) => s.setAssetWdv);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const rows = trialBalance(accounts, journals, entityId);
  const worked = workAssets(assets, entity?.yearEnd ?? "31 Mar 2026");
  const tax = profitsTax(rows, worked, adjustments);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"add" | "deduct" | "loss_bf">("add");
  const [note, setNote] = useState<string | null>(null);
  const [wdv, setWdv] = useState<Record<string, string>>({});
  const depreciationLines = rows.filter((row) => row.account.type === "expense" && /depreciat/i.test(row.account.name) && Math.abs(row.balance) >= 0.02);
  const suggestions = rows.flatMap((row) => {
    if (row.account.type !== "expense" || row.balance <= 0) return [];
    const name = row.account.name;
    if (/entertain|staff welfare|messing/i.test(name)) return [{ label: `${name} — not deductible`, amount: row.balance, kind: "add" as const }];
    if (/motor|vehicle/i.test(name)) return [{ label: `Private use — ${name}`, amount: round2(row.balance * 0.2), kind: "add" as const }];
    if (/interest/i.test(name)) return [{ label: `${name} — confirm deductibility`, amount: row.balance, kind: "add" as const }];
    return [];
  }).filter((item) => !adjustments.some((adjustment) => adjustment.label === item.label));

  return (<>
      <PageTitle
        kicker="Profits tax"
        title="Draft computation. Not a BIR51 filing."
        detail={`${entity?.name ?? "This company"}: two-tiered rates applied as a draft, 8.25% on the first HK$2,000,000 and 16.5% thereafter. Depreciation is added back. Capital allowances are taken from the fixed asset register.`}
      />
      <section className="max-w-xl overflow-hidden rounded-card border border-line bg-panel">
        <table className="w-full text-sm">
          <tbody>
            <Row label="Accounting profit / (loss)" amount={tax.accountingProfit} />
            <Row label="Add: depreciation" amount={tax.depreciationAddBack} />
            <Row label="Less: capital allowance" amount={-tax.capitalAllowance} />
            <Row label="Other additions" amount={tax.added} />
            <Row label="Other deductions" amount={-tax.deducted} />
            <Row label="Loss brought forward used" amount={-tax.lossUsed} />
            <Row label="Assessable profits / (loss)" amount={tax.assessable} strong />
            <Row label="Tax at 8.25%" amount={round2(tax.firstBand * 0.0825)} />
            <Row label="Tax at 16.5%" amount={round2(tax.upperBand * 0.165)} />
            <Row label="Tax payable" amount={tax.tax} strong />
            <Row label="Loss brought forward" amount={tax.lossBrought} />
            {tax.lossCarried > 0 ? <Row label="Loss carried forward" amount={tax.lossCarried} /> : null}
          </tbody>
        </table>
        <ul className="space-y-1 border-t border-line px-4 py-3 text-sm text-muted">
          <li>Accounting profit is the profit and loss, excluding the year-end closing journal.</li>
          {depreciationLines.map((row) => (
            <li key={row.account.id}>Add-back includes {row.account.code} {row.account.name}, {formatHkd(row.balance)}, from the expense account.</li>
          ))}
          {worked.map((row) => (
            <li key={row.asset.id}>{row.asset.name}: allowance {formatHkd(row.allowance)}. {row.note}</li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-3 text-sm text-muted">{taxNarrative(entity?.name ?? "This company", tax)}</p>
        <div className="space-y-3 border-t border-line px-4 py-3 text-sm">
          <p>Loss memorandum: brought forward {formatHkd(tax.lossBrought)}, used {formatHkd(tax.lossUsed)}, carried forward {formatHkd(tax.lossCarried)}.</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={paper.taxReviewed} onChange={(event) => void savePaper({ ...paper, entityId, taxReviewed: event.target.checked })} />
            Computation reviewed
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">Allowance note</span>
            <textarea
              value={paper.allowanceNote}
              onChange={(event) => void savePaper({ ...paper, entityId, allowanceNote: event.target.value })}
              rows={2}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2"
            />
          </label>
        </div>
      </section>
      <section className="mt-4 max-w-xl rounded-card border border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Adjustments</h2>
        {suggestions.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {suggestions.map((item) => (
              <li key={item.label} className="flex flex-wrap items-center justify-between gap-2">
                <span>{item.label} · {formatHkd(item.amount)}</span>
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-line px-3 text-xs"
                  onClick={() => void saveAdjustment({ entityId, label: item.label, amount: item.amount, kind: item.kind }).then((error) => setNote(error ?? "Adjustment added from the books."))}
                >
                  Use this
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted">No further suggested add-backs from the account names.</p>}
        <div className="mt-3 grid gap-2">
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Description" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <select value={kind} onChange={(event) => setKind(event.target.value as "add" | "deduct" | "loss_bf")} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm">
              <option value="add">Add back</option>
              <option value="deduct">Deduct</option>
              <option value="loss_bf">Loss brought forward</option>
            </select>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Amount" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-right text-sm tabular" />
          </div>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
            onClick={() => void saveAdjustment({ entityId, label, amount: Number(amount), kind }).then((error) => {
              setNote(error ?? "Adjustment saved.");
              if (!error) {
                setLabel("");
                setAmount("");
              }
            })}
          >
            Add adjustment
          </button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {adjustments.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span>{item.kind === "add" ? "Add" : item.kind === "deduct" ? "Deduct" : "Loss b/f"} · {item.label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular">{formatHkd(item.amount)}</span>
                <button type="button" className="text-xs text-seal" onClick={() => void removeAdjustment(item.id)}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
      </section>
      <section className="mt-4 max-w-xl overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Capital allowances</h2>
        <table className="w-full text-sm">
          <tbody>
            {worked.map((row) => (
              <tr key={row.asset.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <p>{row.asset.name}</p>
                  <p className="text-muted">{row.note}</p>
                </td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(row.allowance)}</td>
                <td className="px-4 py-2 text-right">
                  {row.asset.category === "plant" ? (
                    <span className="inline-flex items-center justify-end gap-2">
                      <input
                        value={wdv[row.asset.id] ?? (row.asset.taxWdv == null ? "" : String(row.asset.taxWdv))}
                        onChange={(event) => setWdv({ ...wdv, [row.asset.id]: event.target.value })}
                        inputMode="decimal"
                        placeholder="WDV"
                        className="min-h-9 w-28 rounded-lg border border-line bg-paper px-2 text-right tabular"
                      />
                      <button type="button" className="text-pine" onClick={() => void setAssetWdv(row.asset.id, Number(wdv[row.asset.id] ?? row.asset.taxWdv ?? 0)).then((error) => setNote(error ?? "Written-down value saved."))}>
                        Save
                      </button>
                    </span>
                  ) : (
                    <span className="tabular text-muted">{row.asset.taxWdv == null ? "—" : formatHkd(row.asset.taxWdv)}</span>
                  )}
                </td>
              </tr>
            ))}
            {worked.length === 0 ? (
              <tr><td className="px-4 py-3 text-muted" colSpan={3}>No assets on the register. Allowances, if any, are taken from the plant and building accounts.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
        onClick={() =>
          downloadBir51({
            entityName: entity?.name ?? "Company",
            crNumber: entity?.crNumber ?? "",
            yearEnd: entity?.yearEnd ?? "31 Mar 2026",
            tax,
            assets: worked,
            bookDepreciation: tax.registerDepreciation,
          })
        }
      >
        Export profits tax computation
      </button>
      <button
        type="button"
        className="mt-3 ml-2 min-h-11 rounded-lg border border-line px-4 text-sm"
        onClick={() =>
          downloadText(
            "profits-tax-working-paper.txt",
            [
              `${entity?.name ?? "Company"} profits tax working paper`,
              `Accounting profit ${formatHkd(tax.accountingProfit)}`,
              `Depreciation added back ${formatHkd(tax.depreciationAddBack)}`,
              ...depreciationLines.map((row) => `  ${row.account.code} ${row.account.name} ${formatHkd(row.balance)}`),
              `Capital allowance ${formatHkd(tax.capitalAllowance)}`,
              ...worked.map((row) => `  ${row.asset.name} ${formatHkd(row.allowance)} — ${row.note}`),
              ...adjustments.map((item) => `${item.kind} ${item.label} ${formatHkd(item.amount)}`),
              paper.allowanceNote ? `Note: ${paper.allowanceNote}` : "",
              `Assessable ${formatHkd(tax.assessable)}`,
              `Tax payable ${formatHkd(tax.tax)}`,
              `Loss brought forward ${formatHkd(tax.lossBrought)}; carried ${formatHkd(tax.lossCarried)}`,
              paper.taxReviewed ? "Marked reviewed." : "Not yet marked reviewed.",
            ].filter(Boolean).join("\n"),
          )
        }
      >
        Export the working paper
      </button>
  </>);
}

function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (<>
    <tr className="border-t border-line first:border-t-0">
      <td className={`px-4 py-2 ${strong ? "font-medium" : ""}`}>{label}</td>
      <td className={`px-4 py-2 text-right tabular ${strong ? "font-medium" : ""}`}>{formatHkd(amount)}</td>
    </tr>
  </>);
}
