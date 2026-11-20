import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { chartTooltip, DateRange } from "@/components/date-range";
import { useLedger } from "@/lib/accounting/store";
import { formatHkd, round2, axisTick } from "@/lib/accounting/money";
import { yearEndIso, yearStartIso, daysBetween } from "@/lib/accounting/subledger";
import { accountFlow, signedBalance, trialBalance } from "@/lib/accounting/model";
import { emptyPaper, type EntityPaper } from "@/lib/accounting/ledger.functions";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/bank")({ component: BankPage });

type CsvMap = NonNullable<EntityPaper["csvMap"]>;

function splitCsv(line: string): string[] {
  return line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
}

function guessMap(headers: string[]): CsvMap | null {
  const index = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header));
  const date = index(/date/i);
  const description = index(/desc|narr|particular|detail/i);
  const amount = index(/amount|amt/i);
  const debit = index(/debit|withdrawal|paid out/i);
  const credit = index(/credit|deposit|paid in/i);
  if (date < 0 || description < 0) return null;
  if (amount < 0 && (debit < 0 || credit < 0)) return null;
  return { date, description, amount: amount < 0 ? -1 : amount, debit, credit };
}

function rowsFrom(table: string[][], map: CsvMap) {
  const rows: { date: string; description: string; amount: number }[] = [];
  for (const cells of table) {
    const date = (cells[map.date] ?? "").slice(0, 10);
    const description = cells[map.description] || "Bank line";
    const amount = map.amount >= 0
      ? Number(cells[map.amount] ?? "")
      : round2((Number(cells[map.credit] ?? "") || 0) - (Number(cells[map.debit] ?? "") || 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount)) continue;
    rows.push({ date, description, amount });
  }
  return rows;
}

const SAMPLE = `date,description,amount
2025-04-01,Share capital received,10000
2025-04-01,Director advance,1000000
2025-04-02,Advance to shareholder,-10000
2025-06-10,Cash sales,9999.66
2025-06-12,Paid suppliers,-6633.32
2025-06-15,Unidentified withdrawal,-500
`;

export function BankPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const yearEnd = yearEndIso(entity?.yearEnd ?? "31 Mar 2026");
  const [from, setFrom] = useState(yearStartIso(yearEnd));
  const [to, setTo] = useState(yearEnd);
  const allLines = useLedger((s) => s.bankLines);
  const journals = useLedger((s) => s.journals);
  const accounts = useLedger((s) => s.accounts);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const matchBank = useLedger((s) => s.matchBank);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const lines = useMemo(
    () => allLines.filter((line) => line.entityId === entityId && line.date >= from && line.date <= to),
    [allLines, entityId, from, to],
  );
  const importBank = useLedger((s) => s.importBank);
  const postJournal = useLedger((s) => s.postJournal);
  const entities = useLedger((s) => s.entities);
  const [proposeId, setProposeId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{ headers: string[]; body: string[][] } | null>(null);
  const [map, setMap] = useState<CsvMap>({ date: 0, description: 1, amount: 2, debit: -1, credit: -1 });
  const open = lines.filter((line) => !line.matchedJournalId);
  const matched = lines.length - open.length;
  const monthly = useMemo(() => {
    const buckets = new Map<string, { receipts: number; payments: number }>();
    const ordered = [...lines].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    const closing = new Map<string, number>();
    for (const line of ordered) {
      const key = line.date.slice(0, 7);
      const bucket = buckets.get(key) ?? { receipts: 0, payments: 0 };
      if (line.amount >= 0) bucket.receipts = round2(bucket.receipts + line.amount);
      else bucket.payments = round2(bucket.payments + Math.abs(line.amount));
      buckets.set(key, bucket);
      running = round2(running + line.amount);
      closing.set(key, running);
    }
    return [...buckets.entries()].map(([month, value]) => ({
      month,
      receipts: value.receipts,
      payments: value.payments,
      closing: closing.get(month) ?? 0,
    }));
  }, [lines]);

  const moves = useMemo(() => {
    return journals
      .filter((journal) => journal.entityId === entityId)
      .flatMap((journal) =>
        journal.lines
          .filter((line) => {
            const account = accounts.find((item) => item.id === line.accountId);
            return account ? accountFlow(account) === "cash" : false;
          })
          .map((line) => ({
            journalId: journal.id,
            voucher: journal.voucherNumber,
            date: journal.date,
            amount: round2(line.debit - line.credit),
          })),
      );
  }, [journals, accounts, entityId]);

  function suggestionFor(line: { id: string; date: string; description: string; amount: number; matchedJournalId: string | null }) {
    if (line.matchedJournalId) return null;
    const used = new Set(allLines.map((item) => item.matchedJournalId).filter(Boolean));
    const widened = paper.bankRules.some((rule) => line.description.toLowerCase().includes(rule.toLowerCase()));
    const window = widened ? 14 : 2;
    return (
      moves.find(
        (move) =>
          !used.has(move.journalId) &&
          Math.abs(move.amount - line.amount) < 0.02 &&
          Math.abs(daysBetween(line.date, move.date)) <= window &&
          move.date !== line.date,
      ) ?? null
    );
  }

  async function commit(rows: { date: string; description: string; amount: number }[], chosen: CsvMap) {
    const error = await importBank(entityId, rows);
    setNote(error ?? `Imported ${rows.length} lines. Exact date and amount are reconciled. Near matches are suggested.`);
    if (!error) {
      setPending(null);
      if (JSON.stringify(chosen) !== JSON.stringify(paper.csvMap)) {
        await savePaper({ ...paper, entityId, csvMap: chosen });
      }
    }
  }

  const bookCash = useMemo(() => {
    const rows = trialBalance(accounts, journals, entityId, { from, to });
    return round2(rows.filter((row) => accountFlow(row.account) === "cash").reduce((sum, row) => sum + signedBalance(row.account, row.balance), 0));
  }, [accounts, journals, entityId, from, to]);
  const statementMove = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const suggestions = lines.flatMap((line) => {
    const hit = suggestionFor(line);
    return hit ? [{ line, hit }] : [];
  });

  async function run(text: string, chosen?: CsvMap) {
    const raw = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (raw.length === 0) return;
    const headers = splitCsv(raw[0]);
    const body = raw.slice(1).map(splitCsv);
    const saved = paper.csvMap;
    const guessed = guessMap(headers);
    const use = chosen ?? saved ?? guessed;
    if (!use) {
      setPending({ headers, body });
      setMap({ date: 0, description: Math.min(1, headers.length - 1), amount: Math.min(2, headers.length - 1), debit: -1, credit: -1 });
      setNote("Choose which columns are the date, the description, and the amount. The choice is kept for this company.");
      return;
    }
    await commit(rowsFrom(body, use), use);
  }

  return (<>
      <PageTitle
        kicker="Bank"
        title="Reconcile the statement to the cash book."
        detail="Positive amounts are receipts. Negative amounts are payments. A line matches a cash posting of the same date and amount. Unmatched lines remain on the period-close checklist."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-panel px-4 text-sm">
          Import bank statement
          <input
            type="file"
            accept=".csv,.txt"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then(run);
            }}
          />
        </label>
        <button type="button" onClick={() => void run(SAMPLE)} className="min-h-11 rounded-full bg-pine px-4 text-sm text-panel">
          Load sample statement
        </button>
        <button
          type="button"
          disabled={suggestions.length === 0}
          className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-50"
          onClick={() => {
            void (async () => {
              for (const item of suggestions) {
                const error = await matchBank(item.line.id, item.hit.journalId);
                if (error) {
                  setNote(error);
                  return;
                }
              }
              setNote(`Accepted ${suggestions.length} suggested match${suggestions.length === 1 ? "" : "es"}.`);
            })();
          }}
        >
          Accept all suggestions
        </button>
      </div>
      {note ? <p className="mb-4 text-sm text-pine">{note}</p> : null}
      {pending ? (
        <section className="mb-4 rounded-card border border-line bg-panel p-4">
          <h2 className="font-serif text-xl">Column mapping</h2>
          <p className="mt-1 text-sm text-muted">Saved for this company and used on the next statement with the same layout.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(
              [
                ["date", "Date"],
                ["description", "Description"],
                ["amount", "Amount, if one column"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">{label}</span>
                <select
                  value={map[key]}
                  onChange={(event) => setMap({ ...map, [key]: Number(event.target.value) })}
                  className="min-h-11 w-full rounded-lg border border-line bg-paper px-2"
                >
                  {key === "amount" ? <option value={-1}>Use debit and credit</option> : null}
                  {pending.headers.map((header, index) => (
                    <option key={header + index} value={index}>{header || `Column ${index + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {map.amount < 0 ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select value={map.debit} onChange={(event) => setMap({ ...map, debit: Number(event.target.value) })} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm">
                {pending.headers.map((header, index) => <option key={`d${index}`} value={index}>Debit · {header}</option>)}
              </select>
              <select value={map.credit} onChange={(event) => setMap({ ...map, credit: Number(event.target.value) })} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm">
                {pending.headers.map((header, index) => <option key={`c${index}`} value={index}>Credit · {header}</option>)}
              </select>
            </div>
          ) : null}
          <button type="button" className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void commit(rowsFrom(pending.body, map), map)}>
            Import with this mapping
          </button>
        </section>
      ) : null}
      <DateRange from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-card border border-line bg-panel px-4 py-3">
          <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Reconciled</p>
          <p className="mt-1 font-serif text-2xl text-pine">{matched}</p>
        </article>
        <article className="rounded-card border border-line bg-panel px-4 py-3">
          <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Statement vs books</p>
          <p className="mt-1 font-serif text-2xl">{formatHkd(round2(statementMove - bookCash))}</p>
          <p className="mt-1 text-xs text-muted">Statement movement {formatHkd(statementMove)} · cash-book movement {formatHkd(bookCash)}</p>
        </article>
      </section>
      {monthly.length ? (
        <article className="mb-4 rounded-card border border-line bg-panel p-4">
          <h2 className="font-serif text-xl">Cash by month</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--chart-tick)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={axisTick} />
                <Tooltip formatter={(value) => formatHkd(Number(value))} {...chartTooltip} />
                <Legend wrapperStyle={{ color: "var(--color-ink)" }} />
                <Bar dataKey="receipts" name="Receipts" fill="var(--chart-a)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="payments" name="Payments" fill="var(--chart-b)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      ) : null}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">Other account for an unmatched line</span>
          <select value={proposeId} onChange={(event) => setProposeId(event.target.value)} className="min-h-11 rounded-lg border border-line bg-panel px-2">
            <option value="">Choose an account</option>
            {accounts.filter((account) => account.entityId === entityId && accountFlow(account) !== "cash").map((account) => (
              <option key={account.id} value={account.id}>{account.code} {account.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">Copy rules from</span>
          <select
            defaultValue=""
            onChange={(event) => {
              const source = papers.find((item) => item.entityId === event.target.value);
              if (!source) return;
              const bankRules = [...new Set([...paper.bankRules, ...source.bankRules])];
              void savePaper({ ...paper, entityId, bankRules }).then((error) => setNote(error ?? `Copied ${source.bankRules.length} rules.`));
            }}
            className="min-h-11 rounded-lg border border-line bg-panel px-2"
          >
            <option value="">Another company</option>
            {entities.filter((item) => item.id !== entityId).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-panel">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-[11px] tracking-[0.14em] text-muted uppercase">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className="px-4 py-2 tabular text-muted">{line.date}</td>
                <td className="px-4 py-2">{line.description}</td>
                <td className={`px-4 py-2 text-right tabular ${line.amount < 0 ? "text-seal" : ""}`}>{formatHkd(line.amount)}</td>
                <td className="px-4 py-2">
                  {line.matchedJournalId ? "Reconciled" : (() => {
                    const hit = suggestionFor(line);
                    if (!hit) {
                      const age = daysBetween(line.date, to);
                      return (
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Unmatched · {age} days</span>
                          <button
                            type="button"
                            className="rounded-lg border border-line px-2 py-1 text-xs"
                            onClick={() => {
                              const cash = accounts.find((account) => account.entityId === entityId && accountFlow(account) === "cash");
                              if (!cash || !proposeId) {
                                setNote("Choose the other account, and keep a cash at bank account on the chart.");
                                return;
                              }
                              const amount = Math.abs(line.amount);
                              const voucher = `BK-${line.date.replace(/-/g, "")}-${line.id.slice(-4)}`;
                              const entry = line.amount >= 0
                                ? [
                                    { accountId: cash.id, debit: amount, credit: 0, description: line.description },
                                    { accountId: proposeId, debit: 0, credit: amount, description: line.description },
                                  ]
                                : [
                                    { accountId: proposeId, debit: amount, credit: 0, description: line.description },
                                    { accountId: cash.id, debit: 0, credit: amount, description: line.description },
                                  ];
                              void postJournal({ entityId, voucherNumber: voucher, date: line.date, reason: line.description || "Bank line", lines: entry }).then(async (error) => {
                                if (error) {
                                  setNote(error);
                                  return;
                                }
                                const posted = useLedger.getState().journals.find((journal) => journal.entityId === entityId && journal.voucherNumber === voucher);
                                if (!posted) {
                                  setNote("Posted, but the voucher could not be matched automatically.");
                                  return;
                                }
                                const matched = await matchBank(line.id, posted.id);
                                setNote(matched ?? `Posted ${voucher} and matched the line.`);
                              });
                            }}
                          >
                            Post and match
                          </button>
                        </span>
                      );
                    }
                    return (
                      <span className="flex flex-wrap items-center gap-2">
                        <span>Suggested {hit.voucher} · {hit.date}</span>
                        <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => void matchBank(line.id, hit.journalId).then((error) => setNote(error ?? `Matched to ${hit.voucher}.`))}>
                          Accept
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-line px-2 py-1 text-xs"
                          onClick={() => {
                            const phrase = line.description.trim();
                            if (!phrase || paper.bankRules.some((rule) => rule.toLowerCase() === phrase.toLowerCase())) return;
                            void savePaper({ ...paper, entityId, bankRules: [...paper.bankRules, phrase] }).then((error) => setNote(error ?? `Rule saved: “${phrase}” matches within 14 days.`));
                          }}
                        >
                          Save rule
                        </button>
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No bank statement imported.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
  </>);
}
