import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { statements, trialBalance } from "@/lib/accounting/model";
import { formatHkd } from "@/lib/accounting/money";
import { go } from "@/lib/accounting/nav";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/client")({ component: ClientPage });

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ClientPage() {
  const load = useLedger((s) => s.load);
  const hydrated = useLedger((s) => s.hydrated);
  const entityId = useLedger((s) => s.activeEntityId);
  const setEntity = useLedger((s) => s.setEntity);
  const entities = useLedger((s) => s.entities);
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const reviews = useLedger((s) => s.reviews);
  const allRequests = useLedger((s) => s.requests);
  const fulfillRequest = useLedger((s) => s.fulfillRequest);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const entity = entities.find((item) => item.id === entityId);
  const review = reviews.find((item) => item.entityId === entityId);
  const requests = useMemo(() => allRequests.filter((item) => item.entityId === entityId), [allRequests, entityId]);
  const released = review?.status === "released";
  const result = released ? statements(trialBalance(accounts, journals, entityId)).incomeTotal : null;

  return (<>
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line px-4 py-5 md:px-8">
        <p className="font-serif text-2xl leading-none">Arthur</p>
        <p className="mt-1 text-xs tracking-[0.16em] text-muted uppercase">Client portal · v1.0</p>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Your company</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight">Released results.</h1>
        <label className="mt-4 block">
          <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Company</span>
          <select
            value={entityId}
            onChange={(event) => setEntity(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm"
          >
            {entities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <section className="mt-6 rounded-card border border-line bg-panel p-4">
          {released && result != null ? (
            <>
              <p className="text-sm text-muted">Year ended {entity?.yearEnd}. This is the result released by the firm. Working papers remain with the firm.</p>
              <p className={`mt-3 font-serif text-3xl tabular ${result < 0 ? "text-seal" : "text-pine"}`}>{formatHkd(result)}</p>
              <p className="mt-1 text-sm text-muted">{result < 0 ? "Loss for the year" : "Profit for the year"}</p>
            </>
          ) : (
            <p className="text-sm">No results have been released. Outstanding requests are listed below.</p>
          )}
        </section>
        <section className="mt-4">
          <h2 className="font-serif text-xl">Outstanding requests</h2>
          <ul className="mt-3 space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="rounded-card border border-line bg-panel p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{request.title}</p>
                  <span className={request.status === "received" ? "text-pine" : "text-muted"}>
                    {request.status === "received" ? "Received" : "Outstanding"}
                  </span>
                </div>
                {request.detail ? <p className="mt-1 text-muted">{request.detail}</p> : null}
                {request.status === "open" ? (
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center">
                    <span className="rounded-lg bg-pine px-4 py-2 text-panel">Upload a file</span>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 4_000_000) {
                          setNote("The file must be under 4 MB.");
                          return;
                        }
                        void fileToBase64(file).then((body) =>
                          fulfillRequest({
                            requestId: request.id,
                            filename: file.name,
                            mime: file.type || "application/octet-stream",
                            body,
                          }).then((error) => setNote(error ?? `Received ${file.name}.`)),
                        );
                      }}
                    />
                  </label>
                ) : null}
              </li>
            ))}
            {requests.length === 0 ? <li className="text-sm text-muted">No outstanding requests.</li> : null}
          </ul>
          {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
        </section>
        <button type="button" onClick={() => go("/")} className="mt-8 inline-flex min-h-11 items-center text-sm text-pine">
          Return to the practice
        </button>
      </main>
    </div>
  </>);
}
