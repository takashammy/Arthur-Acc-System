import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageTitle } from "@/components/shell";
import { useLedger } from "@/lib/accounting/store";
import { formatHkd, round2 } from "@/lib/accounting/money";
import { signedBalance, trialBalance, STANDARD_CODES, type AccountType } from "@/lib/accounting/model";

export const Route = createFileRoute("/journals")({ component: JournalsPage });

interface Draft {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

function blankLine(): Draft {
  return { key: Math.random().toString(36).slice(2), accountId: "", debit: "", credit: "", description: "" };
}

const TEMPLATES = [
  { label: "Director's current", reason: "Director's current account", debit: /expense|purchases|5000/i, credit: /director|2100/i },
  { label: "MPF", reason: "MPF contribution", debit: /mpf|expense|6100|5000/i, credit: /payable|mpf|2000/i },
  { label: "Depreciation", reason: "Depreciation for the period", debit: /depreciat|6100/i, credit: /accumulated|1510/i },
] as const;

export function JournalsPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allAccounts = useLedger((s) => s.accounts);
  const allJournals = useLedger((s) => s.journals);
  const periods = useLedger((s) => s.periods);
  const accounts = useMemo(() => allAccounts.filter((a) => a.entityId === entityId), [allAccounts, entityId]);
  const journals = useMemo(() => allJournals.filter((j) => j.entityId === entityId), [allJournals, entityId]);
  const period = periods.find((p) => p.entityId === entityId);
  const postJournal = useLedger((s) => s.postJournal);
  const reverseJournal = useLedger((s) => s.reverseJournal);
  const addAccount = useLedger((s) => s.addAccount);
  const setAccountType = useLedger((s) => s.setAccountType);
  const lockPeriod = useLedger((s) => s.lockPeriod);
  const unlockPeriod = useLedger((s) => s.unlockPeriod);
  const links = useLedger((s) => s.links);
  const documents = useLedger((s) => s.documents);
  const role = useLedger((s) => s.role);
  const reviews = useLedger((s) => s.reviews);
  const signed = ["signed", "released"].includes(reviews.find((item) => item.entityId === entityId)?.status ?? "");

  const [voucher, setVoucher] = useState("");
  const [date, setDate] = useState("2026-03-31");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Draft[]>([blankLine(), blankLine()]);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [screen, setScreen] = useState<"post" | "posted" | "chart">("post");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [codesOpen, setCodesOpen] = useState(false);

  const balances = useMemo(() => {
    const rows = trialBalance(allAccounts, allJournals, entityId);
    return new Map(rows.map((row) => [row.account.id, signedBalance(row.account, row.balance)]));
  }, [allAccounts, allJournals, entityId]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const posted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minAmount);
    return journals.filter((journal) => {
      if (from && journal.date < from) return false;
      if (to && journal.date > to) return false;
      if (filterAccount && !journal.lines.some((line) => line.accountId === filterAccount)) return false;
      const total = journal.lines.reduce((sum, line) => sum + line.debit, 0);
      if (minAmount.trim() && !(total + 0.001 >= min)) return false;
      if (!q) return true;
      const names = journal.lines.map((line) => accountById.get(line.accountId)?.name ?? "").join(" ");
      const codes = journal.lines.map((line) => accountById.get(line.accountId)?.code ?? "").join(" ");
      return `${journal.voucherNumber} ${journal.reason} ${names} ${codes} ${journal.date}`.toLowerCase().includes(q);
    });
  }, [journals, query, from, to, filterAccount, minAmount, accountById]);
  const ordered = useMemo(() => {
    const rows = [...posted].sort((a, b) => a.date.localeCompare(b.date) || a.voucherNumber.localeCompare(b.voucherNumber));
    if (!filterAccount) return rows.map((journal) => ({ journal, running: null as number | null }));
    let running = 0;
    return rows.map((journal) => {
      const line = journal.lines.find((item) => item.accountId === filterAccount);
      running = round2(running + (line?.debit ?? 0) - (line?.credit ?? 0));
      return { journal, running };
    });
  }, [posted, filterAccount]);
  const totals = useMemo(() => {
    const debit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
    const credit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
    return { debit, credit, diff: round2(debit - credit) };
  }, [lines]);

  function update(key: string, patch: Partial<Draft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function post() {
    void postJournal({
      entityId,
      voucherNumber: voucher || suggestVoucher(journals.length),
      date,
      reason,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
        description: line.description,
      })),
    }).then((error) => {
      if (error) {
        setOk(false);
        setMessage(error);
        return;
      }
      setOk(true);
      setMessage("Posted. A posted journal cannot be amended. Reverse the entry if a correction is required.");
      setVoucher("");
      setReason("");
      setLines([blankLine(), blankLine()]);
    });
  }

  return (<>
      <PageTitle
        kicker="General journal"
        title="Post a balanced journal."
        detail="Debits must equal credits before a voucher is accepted. A locked period rejects new postings."
      />
      {signed ? (
        <p className="mb-4 rounded-card border border-line bg-warn-bg px-4 py-3 text-sm text-brass">
          This file is signed. A later journal is a post-sign adjustment: the narration must say “post-sign adjustment”, and the file goes back for review.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["post", "Post entry"],
            ["posted", "Posted journals"],
            ["chart", "Chart of accounts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScreen(id)}
            className={`min-h-11 rounded-full px-4 text-sm ${screen === id ? "bg-ink text-panel" : "border border-line bg-panel"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCodesOpen(true)}
          className="min-h-11 rounded-full border border-line bg-panel px-4 text-sm"
        >
          Account codes
        </button>
      </div>

      {screen === "post" ? (
      <section
        className="rounded-card border border-line bg-panel p-4"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && Math.abs(totals.diff) < 0.005) {
            event.preventDefault();
            post();
          }
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Voucher">
            <input
              value={voucher}
              placeholder={suggestVoucher(journals.length)}
              onChange={(e) => setVoucher(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm"
            />
          </Field>
          <Field label="Narration">
            <input
              value={reason}
              placeholder={signed ? "Post-sign adjustment — reason" : "Narration"}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 overflow-visible">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-[11px] tracking-[0.14em] text-muted uppercase">
              <tr>
                <th className="py-2 font-medium">Account</th>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Debit</th>
                <th className="py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-line">
                  <td className="py-2 pr-2">
                    <AccountPick accounts={accounts} balances={balances} value={line.accountId} onChange={(accountId) => update(line.key, { accountId })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value })}
                      className="min-h-11 w-full rounded-lg border border-line bg-paper px-2"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(e) => update(line.key, { debit: e.target.value, credit: "" })}
                      className="min-h-11 w-full rounded-lg border border-line bg-paper px-2 text-right tabular"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(e) => update(line.key, { credit: e.target.value, debit: "" })}
                      className="min-h-11 w-full rounded-lg border border-line bg-paper px-2 text-right tabular"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setLines((current) => [...current, blankLine()])}
            className="min-h-11 rounded-lg border border-line px-4 text-sm"
          >
            Add line
          </button>
          <p className={`text-sm tabular ${Math.abs(totals.diff) < 0.005 ? "text-pine" : "text-seal"}`}>
            Debit {formatHkd(totals.debit)} · Credit {formatHkd(totals.credit)} · Difference {formatHkd(totals.diff)}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TEMPLATES.map((item) => (
            <button
              key={item.label}
              type="button"
              className="min-h-9 rounded-full border border-line px-3 text-xs"
              onClick={() => {
                const debit = accounts.find((account) => item.debit.test(`${account.code} ${account.name}`));
                const credit = accounts.find((account) => item.credit.test(`${account.code} ${account.name}`));
                setReason(signed ? `Post-sign adjustment — ${item.reason}` : item.reason);
                setLines([
                  { ...blankLine(), accountId: debit?.id ?? "", description: item.reason },
                  { ...blankLine(), accountId: credit?.id ?? "", description: item.reason },
                ]);
                setMessage(debit && credit ? `${item.label} filled. Enter the amount, then Ctrl+Enter to post.` : `${item.label} needs both accounts on the chart.`);
                setOk(Boolean(debit && credit));
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={post} className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel">
            Post journal entry
          </button>
          <span className="self-center text-xs text-muted">Ctrl+Enter posts when the entry balances.</span>
          {period?.status === "open" ? (
            <button
              type="button"
              onClick={() => {
                void lockPeriod(entityId).then((error) => {
                  if (!error) return;
                  setOk(false);
                  setMessage(error);
                });
              }}
              className="min-h-11 rounded-lg border border-line px-4 text-sm"
            >
              Lock period
            </button>
          ) : role === "preparer" ? (
            <span className="self-center text-sm text-muted">A preparer cannot reopen a locked period.</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                void unlockPeriod(entityId).then((error) => {
                  if (!error) return;
                  setOk(false);
                  setMessage(error);
                });
              }}
              className="min-h-11 rounded-lg border border-line px-4 text-sm"
            >
              Reopen period
            </button>
          )}
        </div>
        {message ? <p className={`mt-3 text-sm ${ok ? "text-pine" : "text-seal"}`}>{message}</p> : null}
      </section>
      ) : null}

      {screen === "posted" ? (
      <section className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="grid gap-2 px-4 py-3 md:grid-cols-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Voucher, narration, account" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input value={minAmount} onChange={(event) => setMinAmount(event.target.value)} inputMode="decimal" placeholder="Minimum amount" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <select value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm md:col-span-2">
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} {account.name}</option>
            ))}
          </select>
          <p className="self-center text-sm text-muted md:col-span-2">{posted.length} of {journals.length} journals{filterAccount ? " · running balance is for the filtered account" : ""}</p>
        </div>
        <ul>
          {ordered.map(({ journal, running }) => {
            const reversalOf = journal.reason.match(/^Reversal of (\S+)/)?.[1];
            const reversedBy = journals.find((item) => item.reason.startsWith(`Reversal of ${journal.voucherNumber}`));
            const filed = links.filter((link) => link.journalId === journal.id).map((link) => documents.find((document) => document.id === link.documentId)?.filename).filter(Boolean);
            return (
              <li key={journal.id} className="border-t border-line px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <p>
                    <span className="font-medium">{journal.voucherNumber}</span>
                    <span className="text-muted"> · {journal.date} · {journal.reason}</span>
                    {reversalOf ? <span className="text-muted"> · reverses {reversalOf}</span> : null}
                    {reversedBy ? <span className="text-muted"> · reversed by {reversedBy.voucherNumber}</span> : null}
                  </p>
                  <span className="text-xs tracking-wide text-pine uppercase">
                    {filed.length ? `Posted · ${filed.join(", ")}` : "Posted · no supporting document"}
                  </span>
                  {running != null ? <span className="tabular text-xs text-muted">Running {formatHkd(running)}</span> : null}
                  <button
                    type="button"
                    className="min-h-9 rounded-lg border border-line px-3 text-xs"
                    onClick={() => {
                      void reverseJournal(journal.id).then((error) => {
                        setOk(!error);
                        setMessage(error ?? `Reversed ${journal.voucherNumber}. The original entry is unchanged.`);
                        setScreen("posted");
                      });
                    }}
                  >
                    Reverse
                  </button>
                </div>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {journal.lines.map((line) => {
                      const account = accountById.get(line.accountId);
                      return (
                        <tr key={line.id}>
                          <td className="py-1 text-muted">{account?.code}</td>
                          <td className="py-1">{account?.name}</td>
                          <td className="py-1 text-right tabular">{line.debit ? formatHkd(line.debit) : ""}</td>
                          <td className="py-1 text-right tabular">{line.credit ? formatHkd(line.credit) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}
      {screen === "chart" ? <Chart entityId={entityId} accounts={accounts} addAccount={addAccount} setAccountType={setAccountType} /> : null}
      {codesOpen ? <CodeList onClose={() => setCodesOpen(false)} /> : null}
  </>);
}

function CodeList({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 py-16" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-list-title"
        className="flex max-h-[min(36rem,80vh)] w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-panel shadow"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 id="code-list-title" className="font-serif text-xl">Account codes</h2>
            <p className="text-xs text-muted">Full chart, 1000 to 6500. Not limited to this company.</p>
          </div>
          <button type="button" className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="overflow-auto">
          {STANDARD_CODES.map((account) => (
            <li key={account.code} className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2 text-sm last:border-b-0">
              <span>
                <span className="tabular font-medium">{account.code}</span>
                <span className="text-muted"> · </span>
                {account.name}
              </span>
              <span className="shrink-0 text-xs tracking-wide text-muted uppercase">
                {TYPES.find((item) => item.value === account.type)?.label ?? account.type}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "contra_asset", label: "Contra asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Income" },
  { value: "expense", label: "Expense" },
];

function Chart({
  entityId,
  accounts,
  addAccount,
  setAccountType,
}: {
  entityId: string;
  accounts: { id: string; code: string; name: string; type: AccountType }[];
  addAccount: (input: { entityId: string; code: string; name: string; type: AccountType }) => Promise<string | null>;
  setAccountType: (accountId: string, type: AccountType) => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("expense");
  const [note, setNote] = useState<string | null>(null);
  return (<>
    <section className="rounded-card border border-line bg-panel p-4">
      <h2 className="font-serif text-xl">Chart of accounts</h2>
      <p className="mt-2 text-sm text-muted">Set the type before you rely on the profit and loss or the balance sheet. Imported names are classified from the wording.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-[8rem_1fr_10rem_auto]">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Account name" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
        <select value={type} onChange={(event) => setType(event.target.value as AccountType)} className="min-h-11 rounded-lg border border-line bg-paper px-2 text-sm">
          {TYPES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
          onClick={() => {
            void addAccount({ entityId, code, name, type }).then((error) => {
              setNote(error ?? `Added ${code} ${name}.`);
              if (!error) {
                setCode("");
                setName("");
              }
            });
          }}
        >
          Add account
        </button>
      </div>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
      <ul className="mt-4 divide-y divide-line text-sm">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="tabular text-muted">{account.code}</span> {account.name}</span>
            <select
              value={account.type}
              onChange={(event) => void setAccountType(account.id, event.target.value as AccountType)}
              className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm"
            >
              {TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  </>);
}

function AccountPick({
  accounts,
  balances,
  value,
  onChange,
}: {
  accounts: { id: string; code: string; name: string }[];
  balances: Map<string, number>;
  value: string;
  onChange: (accountId: string) => void;
}) {
  const selected = accounts.find((account) => account.id === value);
  const [text, setText] = useState(selected ? `${selected.code} ${selected.name}` : "");
  const [open, setOpen] = useState(false);
  const q = text.trim().toLowerCase();
  const matches = accounts.filter((account) => !q || `${account.code} ${account.name}`.toLowerCase().includes(q)).slice(0, 8);
  return (
    <div className="relative">
      <input
        value={text}
        placeholder="Code or name"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange("");
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="min-h-11 w-full rounded-lg border border-line bg-paper px-2 text-sm"
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-line bg-panel shadow">
          {matches.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(account.id);
                  setText(`${account.code} ${account.name}`);
                  setOpen(false);
                }}
              >
                <span><span className="tabular text-muted">{account.code}</span> {account.name}</span>
                <span className="tabular text-xs text-muted">{formatHkd(balances.get(account.id) ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (<>
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">{label}</span>
      {children}
    </label>
  </>);
}

function suggestVoucher(count: number) {
  return `JV${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${String(count + 1).padStart(2, "0")}`;
}
