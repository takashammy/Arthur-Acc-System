import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { downloadAuditFile } from "@/lib/accounting/audit-pack";
import { draftIxbrl, downloadIxbrl } from "@/lib/accounting/ixbrl";
import { formatHkd } from "@/lib/accounting/money";
import { statements, trialBalance, tbTotals } from "@/lib/accounting/model";
import { go } from "@/lib/accounting/nav";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/auditor")({ component: AuditorPage });

export function AuditorPage() {
  const load = useLedger((s) => s.load);
  const hydrated = useLedger((s) => s.hydrated);
  const entities = useLedger((s) => s.entities);
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const documents = useLedger((s) => s.documents);
  const links = useLedger((s) => s.links);
  const reviews = useLedger((s) => s.reviews);
  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);
  const packs = useMemo(
    () =>
      entities.map((entity) => {
        const rows = trialBalance(accounts, journals, entity.id);
        const totals = tbTotals(rows);
        const report = statements(rows);
        return { entity, report, agrees: Math.abs(totals.debit - totals.credit) < 0.02 };
      }),
    [entities, accounts, journals],
  );

  return (<>
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line px-4 py-5 md:px-8">
        <p className="font-serif text-2xl leading-none">Arthur</p>
        <p className="mt-1 text-xs tracking-[0.16em] text-muted uppercase">Auditor · v1.0</p>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <h1 className="font-serif text-3xl tracking-tight">Read-only access.</h1>
        <p className="mt-2 text-sm text-muted">Nothing on this page posts a journal. The iXBRL file is a working draft and is not an Inland Revenue Department filing.</p>
        <ul className="mt-6 space-y-4">
          {packs.map(({ entity, report, agrees }) => {
            const review = reviews.find((item) => item.entityId === entity.id);
            const files = documents.filter((document) => document.entityId === entity.id);
            const mine = journals.filter((journal) => journal.entityId === entity.id);
            return (
              <li key={entity.id} className="rounded-card border border-line bg-panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-xl">{entity.name}</h2>
                  <span className="text-sm text-muted">{review?.status ?? "draft"}</span>
                </div>
                <p className="mt-2 text-sm">
                  Result {formatHkd(report.incomeTotal)}. Trial balance {agrees ? "agrees" : "does not agree"}. Balance sheet {report.balanced ? "agrees" : "does not agree"}.
                </p>
                <p className="mt-1 text-sm text-muted">{files.length} supporting documents · {mine.length} vouchers</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
                    onClick={() =>
                      downloadAuditFile({
                        entityName: entity.name,
                        accounts,
                        journals: mine,
                        documents: files,
                        links,
                        entityId: entity.id,
                      })
                    }
                  >
                    Export audit file
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-line px-4 text-sm"
                    onClick={() =>
                      downloadIxbrl(
                        `${entity.name.replace(/\s+/g, "-").toLowerCase()}-ixbrl-draft.html`,
                        draftIxbrl({ entityName: entity.name, crNumber: entity.crNumber, yearEnd: entity.yearEnd, report }),
                      )
                    }
                  >
                    Export iXBRL draft
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => go("/")} className="mt-8 inline-flex min-h-11 items-center text-sm text-pine">
          Return to the practice
        </button>
      </main>
    </div>
  </>);
}
