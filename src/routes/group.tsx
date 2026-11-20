import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageTitle } from "@/components/shell";
import { consolidate, groupTotals } from "@/lib/accounting/group";
import { formatHkd } from "@/lib/accounting/money";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/group")({ component: GroupPage });

export function GroupPage() {
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const eliminations = useLedger((s) => s.eliminations);
  const entities = useLedger((s) => s.entities);
  const addElimination = useLedger((s) => s.addElimination);
  const [debitCode, setDebitCode] = useState("2100");
  const [creditCode, setCreditCode] = useState("1300");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const lines = consolidate(accounts, journals, eliminations);
  const totals = groupTotals(lines);

  return (<>
      <PageTitle
        kicker="Consolidation"
        title="Consolidated trial balance."
        detail={`${entities.map((entity) => entity.name).join(" and ") || "The companies"} are aggregated by account code. Eliminations apply in this view only and do not post to any company's books.`}
      />
      <p className={`text-sm ${totals.agrees ? "text-pine" : "text-seal"}`}>
        {totals.agrees ? "The consolidated trial balance agrees." : "The consolidated trial balance does not agree."} Debits {formatHkd(totals.debit)}.
      </p>
      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-normal">Code</th>
              <th className="px-4 py-2 font-normal">Account</th>
              <th className="px-4 py-2 font-normal">Debit</th>
              <th className="px-4 py-2 font-normal">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.code} className="border-t border-line">
                <td className="px-4 py-2 tabular">{line.code}</td>
                <td className="px-4 py-2">{line.name}</td>
                <td className="px-4 py-2 tabular">{line.debit ? formatHkd(line.debit) : ""}</td>
                <td className="px-4 py-2 tabular">{line.credit ? formatHkd(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        <input value={debitCode} onChange={(event) => setDebitCode(event.target.value)} placeholder="Debit account code" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={creditCode} onChange={(event) => setCreditCode(event.target.value)} placeholder="Credit account code" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <button
          type="button"
          className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
          onClick={() =>
            void addElimination({
              debitCode,
              creditCode,
              amount: Number(amount),
              reason,
              eliminatedOn: "2026-03-31",
            }).then((error) => setNote(error ?? "Elimination recorded."))
          }
        >
          Post elimination
        </button>
      </section>
      {eliminations.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {eliminations.map((row) => (
            <li key={row.id}>
              Dr {row.debitCode} / Cr {row.creditCode} {formatHkd(row.amount)} — {row.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
  </>);
}
