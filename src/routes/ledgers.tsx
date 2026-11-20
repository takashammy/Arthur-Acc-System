import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { AsAt, chartTooltip } from "@/components/date-range";
import { formatHkd, axisTick, round2 } from "@/lib/accounting/money";
import { ageInvoices, invoicesInBucket, openTotal, outstanding, workAssets, yearEndIso, type Invoice } from "@/lib/accounting/subledger";
import { signedBalance, trialBalance } from "@/lib/accounting/model";
import { emptyPaper } from "@/lib/accounting/ledger.functions";
import { downloadText } from "@/lib/accounting/filings";
import { useLedger } from "@/lib/accounting/store";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/ledgers")({ component: LedgersPage });

export function LedgersPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
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
  const [asOf, setAsOf] = useState(yearEndIso(entity?.yearEnd ?? "31 Mar 2026"));
  const receivableAge = ageInvoices(invoices, settlements, "receivable", asOf);
  const payableAge = ageInvoices(invoices, settlements, "payable", asOf);
  const [bucket, setBucket] = useState<{ kind: "receivable" | "payable"; name: string } | null>(null);
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const postJournal = useLedger((s) => s.postJournal);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const book = (code: string) => {
    const rows = trialBalance(accounts, journals, entityId, { to: asOf });
    const row = rows.find((item) => item.account.code === code);
    return row ? signedBalance(row.account, row.balance) : 0;
  };
  const arOpen = openTotal(invoices, settlements, "receivable", asOf);
  const apOpen = openTotal(invoices, settlements, "payable", asOf);
  const arBook = book("1100");
  const apBook = book("2000");
  const worked = workAssets(assets, entity?.yearEnd ?? "31 Mar 2026");
  const registerDep = round2(worked.reduce((sum, row) => sum + row.depreciation, 0));
  const ledgerDep = Math.abs(book("6100") || book("1510"));
  const depGap = round2(registerDep - Math.abs(trialBalance(accounts, journals, entityId, { to: asOf }).filter((row) => /depreciat/i.test(row.account.name) && row.account.type === "expense").reduce((sum, row) => sum + row.balance, 0)));
  const parties = [...new Set(invoices.map((invoice) => invoice.party))];
  const opened = bucket
    ? invoicesInBucket(invoices, settlements, bucket.kind, asOf, bucket.name)
    : [];

  return (<>
      <PageTitle
        kicker="Subledgers"
        title="Trade receivables, trade payables, and fixed assets."
        detail={`Open items are aged to ${asOf}. Posting an invoice records the journal. Settlement records the cash entry. Adding an asset records the cost. Depreciation is posted by journal.`}
      />
      <AsAt value={asOf} onChange={setAsOf} label="Age as at" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 text-sm">
        <p className={`rounded-card border border-line px-4 py-3 ${Math.abs(arOpen - arBook) < 0.02 ? "bg-pine-soft text-pine" : "bg-warn-bg text-seal"}`}>
          Receivables subledger {formatHkd(arOpen)} · control 1100 {formatHkd(arBook)} · difference {formatHkd(round2(arOpen - arBook))}
        </p>
        <p className={`rounded-card border border-line px-4 py-3 ${Math.abs(apOpen - apBook) < 0.02 ? "bg-pine-soft text-pine" : "bg-warn-bg text-seal"}`}>
          Payables subledger {formatHkd(apOpen)} · control 2000 {formatHkd(apBook)} · difference {formatHkd(round2(apOpen - apBook))}
        </p>
      </div>
      <section className="mb-4 rounded-card border border-line bg-panel p-4 text-sm">
        <h2 className="font-serif text-xl">Depreciation to post</h2>
        <p className="mt-1 text-muted">Register charge {formatHkd(registerDep)}. Ledger depreciation expense {formatHkd(ledgerDep)}. Difference {formatHkd(depGap)}.</p>
        <button
          type="button"
          disabled={Math.abs(depGap) < 0.02}
          className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel disabled:opacity-50"
          onClick={() => {
            const debit = accounts.find((account) => account.entityId === entityId && account.type === "expense" && /depreciat/i.test(account.name));
            const credit = accounts.find((account) => account.entityId === entityId && /accumulated/i.test(account.name));
            if (!debit || !credit) return;
            void postJournal({
              entityId,
              voucherNumber: `DEP-${asOf.replace(/-/g, "")}`,
              date: asOf,
              reason: "Depreciation for the period",
              lines: [
                { accountId: debit.id, debit: Math.abs(depGap), credit: 0, description: "Depreciation" },
                { accountId: credit.id, debit: 0, credit: Math.abs(depGap), description: "Depreciation" },
              ],
            });
          }}
        >
          Post the depreciation difference
        </button>
      </section>
      {parties.length ? (
        <section className="mb-4 rounded-card border border-line bg-panel p-4 text-sm">
          <h2 className="font-serif text-xl">Statements and notes</h2>
          <ul className="mt-3 space-y-3">
            {parties.map((party) => {
              const openItems = invoices.filter((invoice) => invoice.party === party && outstanding(invoice, settlements, asOf) > 0.005);
              return (
                <li key={party} className="border-t border-line pt-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{party}</span>
                    <button
                      type="button"
                      className="text-pine"
                      onClick={() =>
                        downloadText(
                          `${party.replace(/\s+/g, "-").toLowerCase()}-statement.txt`,
                          [`Statement — ${party}`, `As at ${asOf}`, ...openItems.map((invoice) => `${invoice.number} due ${invoice.dueDate} ${formatHkd(outstanding(invoice, settlements, asOf))}`), `Total ${formatHkd(openItems.reduce((sum, invoice) => sum + outstanding(invoice, settlements, asOf), 0))}`].join("\n"),
                        )
                      }
                    >
                      Download statement
                    </button>
                  </div>
                  <input
                    value={paper.partyNotes[party] ?? ""}
                    onChange={(event) => void savePaper({ ...paper, entityId, partyNotes: { ...paper.partyNotes, [party]: event.target.value } })}
                    placeholder="Note on this balance"
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-paper px-3"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <AgeBar title="Receivables ageing" rows={receivableAge} onPick={(name) => setBucket({ kind: "receivable", name })} />
        <AgeBar title="Payables ageing" rows={payableAge} onPick={(name) => setBucket({ kind: "payable", name })} />
      </div>
      {bucket ? (
        <section className="mb-4 overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="font-serif text-xl">{bucket.kind === "receivable" ? "Receivables" : "Payables"} · {bucket.name} days</h2>
            <button type="button" className="text-sm text-muted" onClick={() => setBucket(null)}>Close</button>
          </div>
          <ul>
            {opened.map((invoice) => (
              <li key={invoice.id} className="grid grid-cols-[1fr_auto] gap-3 border-t border-line px-4 py-2 text-sm">
                <span>{invoice.number} · {invoice.party} · due {invoice.dueDate}</span>
                <span className="tabular">{formatHkd(outstanding(invoice, settlements, asOf))}</span>
              </li>
            ))}
            {opened.length === 0 ? <li className="px-4 py-3 text-sm text-muted">Nothing in this bucket.</li> : null}
          </ul>
        </section>
      ) : null}
      <InvoiceForm entityId={entityId} />
      <ul className="mt-4 space-y-3">
        {invoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} open={outstanding(invoice, settlements)} />
        ))}
        {invoices.length === 0 ? <li className="text-sm text-muted">No invoices for this company.</li> : null}
      </ul>
      <AssetForm entityId={entityId} />
      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Asset register</h2>
        <table className="w-full text-sm">
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t border-line">
                <td className="px-4 py-2">{asset.name}</td>
                <td className="px-4 py-2 capitalize text-muted">{asset.category}</td>
                <td className="px-4 py-2 tabular text-muted">{asset.acquired}</td>
                <td className="px-4 py-2 text-right tabular">{formatHkd(asset.cost)}</td>
              </tr>
            ))}
            {assets.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted">No assets on the register.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
  </>);
}

function AgeBar({ title, rows, onPick }: { title: string; rows: [string, number][]; onPick: (name: string) => void }) {
  const data = rows.map(([name, amount]) => ({ name, amount }));
  return (
    <article className="rounded-card border border-line bg-panel p-4">
      <h2 className="font-serif text-xl">{title}</h2>
      {data.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing outstanding.</p> : (
        <>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fill: "var(--chart-tick)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--chart-tick)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={axisTick} />
                <Tooltip formatter={(value) => formatHkd(Number(value))} {...chartTooltip} />
                <Bar dataKey="amount" name="Open" fill="var(--chart-a)" radius={[4, 4, 0, 0]} className="cursor-pointer" onClick={(entry) => onPick(String((entry as { name?: string }).name ?? ""))} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {rows.map(([name]) => (
              <button key={name} type="button" onClick={() => onPick(name)} className="min-h-9 rounded-full border border-line px-3 text-xs">
                {name} days
              </button>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function InvoiceForm({ entityId }: { entityId: string }) {
  const createInvoice = useLedger((s) => s.createInvoice);
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const [party, setParty] = useState("");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("2026-01-15");
  const [dueDate, setDueDate] = useState("2026-02-14");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (<>
    <section className="rounded-card border border-line bg-panel p-4">
      <h2 className="font-serif text-xl">Record an invoice</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select value={kind} onChange={(event) => setKind(event.target.value as "receivable" | "payable")} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
          <option value="receivable">Sales invoice</option>
          <option value="payable">Supplier bill</option>
        </select>
        <input value={party} onChange={(event) => setParty(event.target.value)} placeholder="Customer or supplier" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Invoice number" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Amount" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
      </div>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
        onClick={() => {
          void createInvoice({
            entityId,
            kind,
            party,
            number,
            invoiceDate,
            dueDate,
            amount: Number(amount),
          }).then((error) => setNote(error ?? `Posted ${number}.`));
        }}
      >
        Post invoice
      </button>
      {note ? <p className="mt-2 text-sm text-pine">{note}</p> : null}
    </section>
  </>);
}

function InvoiceCard({ invoice, open }: { invoice: Invoice; open: number }) {
  const settleInvoice = useLedger((s) => s.settleInvoice);
  const [amount, setAmount] = useState(String(open));
  const [date, setDate] = useState("2026-03-31");
  const [note, setNote] = useState<string | null>(null);

  return (<>
    <li className="rounded-card border border-line bg-panel p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className="font-medium">{invoice.number}</span>
          <span className="text-muted"> · {invoice.party} · {invoice.kind === "receivable" ? "Receivable" : "Payable"}</span>
        </p>
        <p className="tabular">
          {formatHkd(invoice.amount)}
          <span className="text-muted"> · outstanding {formatHkd(open)}</span>
        </p>
      </div>
      <p className="mt-1 text-muted tabular">
        {invoice.invoiceDate} · due {invoice.dueDate}
      </p>
      {open > 0.005 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3" />
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="min-h-11 w-32 rounded-lg border border-line bg-paper px-3 text-right tabular" />
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4"
            onClick={() => {
              void settleInvoice(invoice.id, date, Number(amount)).then((error) => setNote(error ?? "Settlement posted."));
            }}
          >
            Settle
          </button>
        </div>
      ) : (
        <p className="mt-2 text-pine">Settled</p>
      )}
      {note ? <p className="mt-2 text-pine">{note}</p> : null}
    </li>
  </>);
}

function AssetForm({ entityId }: { entityId: string }) {
  const createAsset = useLedger((s) => s.createAsset);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"building" | "plant">("plant");
  const [acquired, setAcquired] = useState("2026-01-01");
  const [cost, setCost] = useState("");
  const [fund, setFund] = useState<"cash" | "director">("cash");
  const [taxWdv, setTaxWdv] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (<>
    <section className="mt-8 rounded-card border border-line bg-panel p-4">
      <h2 className="font-serif text-xl">Add a fixed asset</h2>
      <p className="mt-1 text-sm text-muted">A building attracts a 4% industrial building allowance. Plant acquired in the year attracts 60% initial and 20% annual allowance. Older plant requires its opening tax written-down value.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <select value={category} onChange={(event) => setCategory(event.target.value as "building" | "plant")} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
          <option value="plant">Plant and machinery</option>
          <option value="building">Building</option>
        </select>
        <input type="date" value={acquired} onChange={(event) => setAcquired(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" placeholder="Cost" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <select value={fund} onChange={(event) => setFund(event.target.value as "cash" | "director")} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
          <option value="cash">Paid from cash at bank</option>
          <option value="director">Funded by a director</option>
        </select>
        <input value={taxWdv} onChange={(event) => setTaxWdv(event.target.value)} inputMode="decimal" placeholder="Opening tax WDV, if brought forward" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
      </div>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
        onClick={() => {
          void createAsset({
            entityId,
            name,
            category,
            acquired,
            cost: Number(cost),
            fund,
            taxWdv: taxWdv.trim() ? Number(taxWdv) : null,
          }).then((error) => setNote(error ?? `Added ${name}. Cost posted. Depreciation has not been posted.`));
        }}
      >
        Add to register
      </button>
      {note ? <p className="mt-2 text-sm text-pine">{note}</p> : null}
    </section>
  </>);
}
