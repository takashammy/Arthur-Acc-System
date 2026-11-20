import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { leaseCharge } from "@/lib/accounting/lease";
import { formatHkd } from "@/lib/accounting/money";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/leases")({ component: LeasesPage });

export function LeasesPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allLeases = useLedger((s) => s.leases);
  const leases = useMemo(() => allLeases.filter((lease) => lease.entityId === entityId), [allLeases, entityId]);
  const addLease = useLedger((s) => s.addLease);
  const recogniseLease = useLedger((s) => s.recogniseLease);
  const postLeaseMonth = useLedger((s) => s.postLeaseMonth);
  const [name, setName] = useState("");
  const [started, setStarted] = useState("2025-04-01");
  const [months, setMonths] = useState("24");
  const [payment, setPayment] = useState("");
  const [rate, setRate] = useState("0.05");
  const [note, setNote] = useState<string | null>(null);

  return (<>
      <PageTitle
        kicker="Leases"
        title="Right-of-use assets and lease liabilities."
        detail="The cost is the present value of the lease payments. Recognition posts that amount to the books. Each period posts interest, principal, and straight-line depreciation."
      />
      <ul className="space-y-3">
        {leases.map((lease) => {
          const next = lease.postedMonths >= 0 ? leaseCharge(lease.liability, lease.payment, lease.annualRate, lease.cost, lease.months) : null;
          return (
            <li key={lease.id} className="rounded-card border border-line bg-panel p-4 text-sm">
              <p className="font-medium">{lease.name}</p>
              <p className="mt-1 text-muted">
                {lease.months} months · {formatHkd(lease.payment)} a month · {(lease.annualRate * 100).toFixed(2)}% · cost {formatHkd(lease.cost)}
              </p>
              <p className="mt-1">
                {lease.postedMonths < 0
                  ? "Not yet recognised."
                  : `Lease liability ${formatHkd(lease.liability)} · ${lease.postedMonths} of ${lease.months} periods posted.`}
              </p>
              {next && lease.postedMonths < lease.months ? (
                <p className="mt-1 text-muted">
                  Next: interest {formatHkd(next.interest)}, principal {formatHkd(next.principal)}, depreciation {formatHkd(next.depreciation)}.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {lease.postedMonths < 0 ? (
                  <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-panel" onClick={() => void recogniseLease(lease.id).then((error) => setNote(error ?? "Lease recognised."))}>
                    Recognise
                  </button>
                ) : lease.postedMonths < lease.months ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-pine px-4 text-panel"
                    onClick={() => void postLeaseMonth(lease.id, "2025-04-30").then((error) => setNote(error ?? "Period charge posted."))}
                  >
                    Post period charge
                  </button>
                ) : (
                  <span className="text-pine">Lease term fully posted.</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lease description" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input type="date" value={started} onChange={(event) => setStarted(event.target.value)} className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={months} onChange={(event) => setMonths(event.target.value)} placeholder="Term in months" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={payment} onChange={(event) => setPayment(event.target.value)} placeholder="Periodic payment" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Annual discount rate, e.g. 0.05" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() =>
            void addLease({
              entityId,
              name,
              started,
              months: Number(months),
              payment: Number(payment),
              annualRate: Number(rate),
            }).then((error) => setNote(error ?? `Lease added: ${name}.`))
          }
        >
          Add lease
        </button>
      </section>
      {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
  </>);
}
