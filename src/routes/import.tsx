import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { parseCsv, parseWorkbook, SAMPLE_CSV, suggestAccount, type ImportResult } from "@/lib/accounting/excel";
import { guessAccountType, type AccountType } from "@/lib/accounting/model";
import { emptyPaper } from "@/lib/accounting/ledger.functions";
import { useLedger } from "@/lib/accounting/store";
import { formatHkd } from "@/lib/accounting/money";

export const Route = createFileRoute("/import")({ component: ImportPage });

export function ImportPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allAccounts = useLedger((s) => s.accounts);
  const accounts = useMemo(() => allAccounts.filter((a) => a.entityId === entityId), [allAccounts, entityId]);
  const importVouchers = useLedger((s) => s.importVouchers);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const addAccount = useLedger((s) => s.addAccount);
  const postJournal = useLedger((s) => s.postJournal);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const [opening, setOpening] = useState("1000,Cash at bank,asset,0,0");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [how, setHow] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  function ingest(next: ImportResult) {
    const names = new Set<string>();
    for (const voucher of next.vouchers) {
      for (const line of voucher.lines) names.add(line.accountName);
    }
    const suggested: Record<string, string> = {};
    const matched: Record<string, string> = {};
    for (const name of names) {
      const saved = paper.importMap[name.toLowerCase()];
      const hit = saved ? { id: accounts.some((account) => account.id === saved) ? saved : "", how: "saved mapping" } : suggestAccount(name, accounts);
      suggested[name] = hit.id;
      matched[name] = hit.how;
    }
    setMap(suggested);
    setHow(matched);
    setResult(next);
    setNote(null);
    setFailed(false);
  }

  async function onFile(file: File) {
    const buffer = await file.arrayBuffer();
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      ingest(parseCsv(file.name, new TextDecoder().decode(buffer)));
      return;
    }
    ingest(parseWorkbook(file.name, buffer));
  }

  async function postClean(mode: "all" | "clean") {
    if (!result || busy) return;
    setBusy(true);
    setNote(null);
    setFailed(false);
    const nameToId = new Map<string, string>();
    for (const [name, id] of Object.entries(map)) {
      if (id) nameToId.set(name.toLowerCase(), id);
    }
    try {
      const outcome = await importVouchers(entityId, result.vouchers, nameToId, mode);
      const skipped = outcome.skipped;
      setFailed(skipped.length > 0 && outcome.posted.length === 0);
      if (outcome.posted.length === 0 && skipped.length) {
        setNote(skipped[0].startsWith("Batch rejected") ? skipped[0] : `Nothing posted. ${skipped.slice(0, 6).join("; ")}`);
        setFailed(true);
      } else {
        const detail = skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 6).join("; ")}` : " Saved to the books.";
        setNote(`Posted ${outcome.posted.length}.${detail}`);
        setFailed(skipped.length > 0);
        if (outcome.posted.length) {
          const importMap = { ...paper.importMap };
          for (const [name, id] of Object.entries(map)) if (id) importMap[name.toLowerCase()] = id;
          void savePaper({ ...paper, entityId, importMap });
        }
      }
    } catch (err) {
      setFailed(true);
      setNote(err instanceof Error ? err.message : "Import failed. Posted journals were left as they stood. Nothing further was written.");
    } finally {
      setBusy(false);
    }
  }

  const names = useMemo(() => {
    const found = new Set<string>();
    for (const voucher of result?.vouchers ?? []) {
      for (const line of voucher.lines) found.add(line.accountName);
    }
    return [...found];
  }, [result]);

  const preview = result?.vouchers.slice(0, 8) ?? [];
  const hidden = result ? Math.max(0, result.vouchers.length - preview.length) : 0;

  const errors = result ? result.vouchers.reduce((n, v) => n + v.issues.filter((i) => i.level === "error").length, 0) + result.issues.filter((i) => i.level === "error").length : 0;
  const cleanCount = result ? result.vouchers.filter((voucher) => voucher.voucherNumber && voucher.date && !voucher.issues.some((issue) => issue.level === "error")).length : 0;
  const blockingNotes = result
    ? [
        ...result.issues.filter((issue) => issue.level === "error"),
        ...result.vouchers.flatMap((voucher) => voucher.issues.filter((issue) => issue.level === "error")),
      ].slice(0, 12)
    : [];

  return (<>
      <PageTitle
        kicker="Excel importer"
        title="No journal is posted until accepted."
        detail="Import a journal workbook or CSV. Signed amounts (debit positive, credit negative), Excel serial dates, duplicate vouchers, and unbalanced entries are flagged before posting."
      />
      {result ? <p className="mb-4 text-sm">{cleanCount} voucher{cleanCount === 1 ? "" : "s"} can post. {Math.max(0, result.vouchers.length - cleanCount)} will be rejected until the errors are cleared. Column mapping is remembered for this company.</p> : null}
      <section className="mb-4 rounded-card border border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Opening balances</h2>
        <p className="mt-1 text-sm text-muted">One line per account: code, name, type, debit, credit. Nothing is posted unless the batch balances.</p>
        <textarea value={opening} onChange={(event) => setOpening(event.target.value)} rows={4} className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() => {
            void (async () => {
              const rows = opening.split(/\n/).map((line) => line.split(",").map((part) => part.trim())).filter((cells) => cells.length >= 5 && cells[0]);
              const debit = rows.reduce((sum, cells) => sum + (Number(cells[3]) || 0), 0);
              const credit = rows.reduce((sum, cells) => sum + (Number(cells[4]) || 0), 0);
              if (Math.abs(debit - credit) >= 0.02) {
                setFailed(true);
                setNote(`Opening balances do not agree. Debits ${formatHkd(debit)}, credits ${formatHkd(credit)}. Nothing was posted.`);
                return;
              }
              const lines = [];
              for (const cells of rows) {
                const [code, name, type, dr, cr] = cells;
                let account = accounts.find((item) => item.code === code);
                if (!account) {
                  const typed = (["asset", "contra_asset", "liability", "equity", "revenue", "expense"].includes(type) ? type : guessAccountType(name)) as AccountType;
                  const error = await addAccount({ entityId, code, name, type: typed });
                  if (error) {
                    setFailed(true);
                    setNote(error);
                    return;
                  }
                  account = useLedger.getState().accounts.find((item) => item.entityId === entityId && item.code === code);
                }
                if (!account) continue;
                lines.push({ accountId: account.id, debit: Number(dr) || 0, credit: Number(cr) || 0, description: "Opening balance" });
              }
              const error = await postJournal({
                entityId,
                voucherNumber: `OB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
                date: "2025-04-01",
                reason: "Opening balances",
                lines,
              });
              setFailed(Boolean(error));
              setNote(error ?? "Opening balances posted.");
            })();
          }}
        >
          Post opening balances
        </button>
      </section>

      <section className="rounded-card border border-dashed border-line bg-panel p-5">
        <label className="flex min-h-28 cursor-pointer flex-col items-start justify-center gap-2">
          <span className="text-sm font-medium">Choose an .xlsx or .csv file</span>
          <span className="text-sm text-muted">Columns: date, voucher, account name, description, signed amount (debit positive, credit negative).</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() => ingest(parseCsv("sample-defects.csv", SAMPLE_CSV))}
        >
          Load validation sample
        </button>
      </section>

      {result ? (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">{result.fileName}</h2>
              <p className="text-sm text-muted">
                {result.vouchers.length} voucher groups · {errors} blocking issue{errors === 1 ? "" : "s"}
                {result.sheetNames.length > 1 ? ` · sheets: ${result.sheetNames.join(", ")}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void postClean("all")} disabled={busy || errors > 0} className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel disabled:opacity-60">
                {busy ? "Posting…" : errors > 0 ? "Batch blocked" : "Post the batch"}
              </button>
              {errors > 0 && cleanCount > 0 ? (
                <button type="button" onClick={() => void postClean("clean")} disabled={busy} className="min-h-11 rounded-lg border border-line px-4 text-sm">
                  Post {cleanCount} balanced vouchers only
                </button>
              ) : null}
            </div>
          </div>
          {note ? <p className={`text-sm ${failed ? "text-seal" : "text-pine"}`}>{note}</p> : null}

          {names.length ? (
            <div className="rounded-card border border-line bg-panel p-4">
              <h3 className="font-medium">Account mapping</h3>
              <p className="mt-1 text-sm text-muted">A close name is suggested. Leave a row blank only if the account should be created. An unbalanced voucher blocks the whole batch.</p>
              <div className="mt-3 grid gap-2">
                {names.map((name) => (
                  <label key={name} className="grid gap-1 text-sm md:grid-cols-[16rem_1fr] md:items-center">
                    <span>
                      {name}
                      <span className="mt-0.5 block text-xs text-muted">
                        {map[name] ? (how[name] === "close" ? "Close match — confirm it" : "Matched") : `Will create · ${guessAccountType(name).replace("_", " ")}`}
                      </span>
                    </span>
                    <select
                      value={map[name] ?? ""}
                      onChange={(e) => {
                        setMap((current) => ({ ...current, [name]: e.target.value }));
                        setHow((current) => ({ ...current, [name]: e.target.value ? "exact" : "" }));
                      }}
                      className="min-h-11 rounded-lg border border-line bg-paper px-2"
                    >
                      <option value="">Create account on posting</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {blockingNotes.length ? (
            <ul className="space-y-2">
              {blockingNotes.map((issue) => (
                <li key={issue.code + issue.message} className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-seal">
                  {issue.message}
                </li>
              ))}
              {errors > blockingNotes.length ? <li className="text-sm text-muted">And {errors - blockingNotes.length} more. Nothing in the batch is posted until these are cleared, unless you post only the balanced vouchers.</li> : null}
            </ul>
          ) : null}

          {result.issues.length ? (
            <ul className="space-y-2">
              {result.issues.map((issue) => (
                <li key={issue.code + issue.message} className={`rounded-lg px-3 py-2 text-sm ${issue.level === "error" ? "bg-warn-bg text-seal" : "bg-pine-soft text-pine"}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {preview.map((voucher) => (
            <article key={`${voucher.voucherNumber}-${voucher.blockIndex ?? 0}-${voucher.date}`} className="rounded-card border border-line bg-panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{voucher.voucherNumber || "Missing voucher"}</h3>
                <span className="text-sm text-muted tabular">{voucher.date || "No date"}</span>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {voucher.lines.map((line, index) => (
                    <tr key={`${line.accountName}-${index}`} className="border-t border-line">
                      <td className="py-2 pr-2">{line.accountName}</td>
                      <td className="py-2 pr-2 text-muted">{line.description}</td>
                      <td className="py-2 text-right tabular">{line.debit ? formatHkd(line.debit) : ""}</td>
                      <td className="py-2 text-right tabular">{line.credit ? formatHkd(line.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {voucher.issues.length ? (
                <ul className="mt-3 space-y-1">
                  {voucher.issues.map((issue) => (
                    <li key={issue.code + issue.message} className={`text-sm ${issue.level === "error" ? "text-seal" : "text-brass"}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-pine">Ready to post.</p>
              )}
            </article>
          ))}
          {hidden ? <p className="text-sm text-muted">And {hidden} more vouchers, not shown so the page stays responsive. They post with the rest.</p> : null}
        </section>
      ) : null}
  </>);
}
