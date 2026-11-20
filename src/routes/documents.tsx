import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { readInvoiceText, type InvoiceRead } from "@/lib/accounting/extract";
import { proposeJournal, type JournalProposal } from "@/lib/accounting/propose";
import { isImage, readImageText } from "@/lib/accounting/ocr";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/documents")({ component: DocumentsPage });

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

export function DocumentsPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allDocuments = useLedger((s) => s.documents);
  const allJournals = useLedger((s) => s.journals);
  const documents = useMemo(() => allDocuments.filter((item) => item.entityId === entityId), [allDocuments, entityId]);
  const journals = useMemo(() => allJournals.filter((item) => item.entityId === entityId), [allJournals, entityId]);
  const links = useLedger((s) => s.links);
  const uploadDocument = useLedger((s) => s.uploadDocument);
  const linkDocument = useLedger((s) => s.linkDocument);
  const openDocument = useLedger((s) => s.openDocument);
  const inspectDocument = useLedger((s) => s.inspectDocument);
  const createInvoice = useLedger((s) => s.createInvoice);
  const allAccounts = useLedger((s) => s.accounts);
  const accounts = useMemo(() => allAccounts.filter((account) => account.entityId === entityId), [allAccounts, entityId]);
  const acceptProposal = useLedger((s) => s.acceptProposal);
  const refineProposal = useLedger((s) => s.refineProposal);
  const [journalId, setJournalId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [proposal, setProposal] = useState<InvoiceRead | null>(null);
  const [kind, setKind] = useState<"payable" | "receivable">("payable");
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<JournalProposal | null>(null);
  const [debitId, setDebitId] = useState("");
  const [creditId, setCreditId] = useState("");

  function accountByCode(code: string) {
    return accounts.find((account) => account.code === code)?.id ?? "";
  }

  function propose() {
    const text = paste || [proposal?.party ? `Supplier: ${proposal.party}` : "", proposal?.date ? `Date: ${proposal.date}` : "", proposal?.amount ? `Total: HKD ${proposal.amount}` : ""].filter(Boolean).join("\n");
    const next = proposeJournal(text, accounts, entityId, kind);
    if ("error" in next) {
      setNote(next.error);
      setDraft(null);
      return;
    }
    setDraft(next);
    setDebitId(accountByCode(next.debitCode));
    setCreditId(accountByCode(next.creditCode));
    setNote(next.rationale);
  }

  function applyRead(read: InvoiceRead, documentId?: string) {
    setProposal(read);
    setSourceId(documentId);
    setNote(read.note);
  }

  async function onFile(file: File) {
    const duplicate = documents.some((item) => item.filename.toLowerCase() === file.name.toLowerCase());
    if (file.size > 4_000_000) {
      setNote("The file must be under 4 MB.");
      return;
    }
    const body = await fileToBase64(file);
    const result = await uploadDocument({
      entityId,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      body,
      journalId: journalId || undefined,
    });
    if (result.error) {
      setNote(result.error);
      return;
    }
    if (!isImage(file.type, file.name)) {
      setNote(`${duplicate ? "A file with this name is already filed. " : ""}Filed ${file.name}. A text invoice can be extracted from the list, or paste the lines below.`);
      return;
    }
    setReading(true);
    setNote("Extracting…");
    try {
      const text = await readImageText(file);
      applyRead(readInvoiceText(text), result.documentId ?? undefined);
      if (duplicate) setNote("A file with this name is already filed. The new copy was still extracted — check it is not the same invoice.");
    } catch {
      setNote("The image could not be read. Enter the supplier, date, and amount.");
    } finally {
      setReading(false);
    }
  }

  async function postProposal() {
    if (!proposal?.party || !proposal.date || !proposal.amount) {
      setNote("Supplier, date, and amount are required before posting.");
      return;
    }
    const due = new Date(`${proposal.date}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    const number = `${kind === "receivable" ? "INV" : "BILL"}-${proposal.date.replace(/-/g, "")}`;
    const error = await createInvoice({
      entityId,
      kind,
      party: proposal.party,
      number,
      invoiceDate: proposal.date,
      dueDate: due.toISOString().slice(0, 10),
      amount: proposal.amount,
      documentId: sourceId,
    });
    setNote(error ?? (sourceId ? `Posted ${number} and linked the file.` : `Posted ${number}.`));
  }

  return (<>
      <PageTitle
        kicker="Documents"
        title="Supporting documents and invoice capture."
        detail="PDF, image, or text, up to 4 MB. A photograph of a printed English invoice can be extracted. Chinese text and unclear images may require correction before posting."
      />
      <section className="rounded-card border border-dashed border-line bg-panel p-5">
        <label className="block text-[11px] tracking-[0.14em] text-muted uppercase">Link to voucher</label>
        <select
          value={journalId}
          onChange={(event) => setJournalId(event.target.value)}
          className="mt-1 min-h-11 w-full max-w-md rounded-lg border border-line bg-paper px-3 text-sm"
        >
          <option value="">File only — link to a voucher later</option>
          {journals.map((journal) => (
            <option key={journal.id} value={journal.id}>
              {journal.voucherNumber} · {journal.reason}
            </option>
          ))}
        </select>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center text-sm">
          <span className="rounded-lg bg-pine px-4 py-2 text-panel">{reading ? "Extracting…" : "Choose a file"}</span>
          <input
            type="file"
            accept="application/pdf,image/*,text/plain,.txt"
            className="sr-only"
            disabled={reading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
      </section>
      <section className="mt-4 rounded-card border border-line bg-panel p-5">
        <h2 className="font-serif text-xl">Extract invoice details</h2>
        <p className="mt-1 text-sm text-muted">Extracted details appear below. Paste text, or amend any field before posting.</p>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={4}
          placeholder={"Supplier: Kowloon Supply Co\nDate: 2026-02-01\nTotal: HKD 1,500.00"}
          className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={proposal?.party ?? ""}
            onChange={(event) => setProposal((current) => ({ party: event.target.value, date: current?.date ?? null, amount: current?.amount ?? null, note: current?.note ?? "" }))}
            placeholder="Supplier"
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm"
          />
          <input
            type="date"
            value={proposal?.date ?? ""}
            onChange={(event) => setProposal((current) => ({ party: current?.party ?? null, date: event.target.value || null, amount: current?.amount ?? null, note: current?.note ?? "" }))}
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm"
          />
          <input
            inputMode="decimal"
            value={proposal?.amount ?? ""}
            onChange={(event) => setProposal((current) => ({ party: current?.party ?? null, date: current?.date ?? null, amount: Number(event.target.value) || null, note: current?.note ?? "" }))}
            placeholder="Total"
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-line px-4 text-sm" onClick={() => applyRead(readInvoiceText(paste))}>
            Extract from text
          </button>
          <select value={kind} onChange={(event) => setKind(event.target.value as "payable" | "receivable")} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
            <option value="payable">Supplier bill</option>
            <option value="receivable">Sales invoice</option>
          </select>
          <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void postProposal()}>
            Post invoice
          </button>
          <button type="button" className="min-h-11 rounded-lg border border-line px-4 text-sm" onClick={propose}>
            Propose the journal
          </button>
        </div>
        {draft ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm">{draft.rationale}</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-muted uppercase">Suggested · {draft.confidence} confidence · {draft.source}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Debit</span>
                <select value={debitId} onChange={(event) => setDebitId(event.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-paper px-3">
                  <option value="">Choose an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.code} {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Credit</span>
                <select value={creditId} onChange={(event) => setCreditId(event.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-paper px-3">
                  <option value="">Choose an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.code} {account.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
                onClick={() =>
                  void acceptProposal({
                    entityId,
                    party: draft.party,
                    date: draft.date,
                    amount: draft.amount,
                    debitAccountId: debitId,
                    creditAccountId: creditId,
                    rationale: draft.rationale,
                    source: draft.source,
                    documentId: sourceId,
                  }).then((error) => {
                    setNote(error ?? `Accepted and posted. ${draft.party} ${draft.amount}.`);
                    if (!error) setDraft(null);
                  })
                }
              >
                Accept and post
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line px-4 text-sm"
                onClick={() =>
                  void refineProposal({
                    text: paste || draft.rationale,
                    kind,
                    accounts: accounts.map((account) => ({ code: account.code, name: account.name, type: account.type })),
                  }).then((result) => {
                    if (!result.ok) {
                      setNote(result.error);
                      return;
                    }
                    setDraft({
                      ...draft,
                      debitCode: result.debitCode,
                      creditCode: result.creditCode,
                      confidence: result.confidence === "high" || result.confidence === "low" ? result.confidence : "medium",
                      rationale: result.rationale,
                      source: "grok",
                    });
                    setDebitId(accountByCode(result.debitCode));
                    setCreditId(accountByCode(result.creditCode));
                    setNote(result.rationale);
                  })
                }
              >
                Ask Grok to redraft
              </button>
              <button type="button" className="min-h-11 rounded-lg border border-line px-4 text-sm" onClick={() => setDraft(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <ul className="mt-6 space-y-3">
        {documents.map((document) => {
          const attached = links.filter((link) => link.documentId === document.id);
          return (
            <li key={document.id} className="rounded-card border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{document.filename}</p>
                <button type="button" onClick={() => void openDocument(document.id)} className="min-h-11 text-sm text-pine">
                  Download
                </button>
                <button
                  type="button"
                  className="min-h-11 text-sm text-pine"
                  onClick={() => {
                    setReading(true);
                    setNote(isImage(document.mime, document.filename) ? "Extracting…" : "Extracting…");
                    void inspectDocument(document.id)
                      .then((read) => applyRead(read, document.id))
                      .finally(() => setReading(false));
                  }}
                >
                  Extract
                </button>
              </div>
              <p className="mt-1 text-sm text-muted">
                {attached.length
                  ? attached
                      .map((link) => journals.find((journal) => journal.id === link.journalId)?.voucherNumber)
                      .filter(Boolean)
                      .join(", ")
                  : "Not linked to a voucher"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm"
                  defaultValue=""
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next) void linkDocument(document.id, next);
                  }}
                >
                  <option value="">Link to another voucher</option>
                  {journals.map((journal) => (
                    <option key={journal.id} value={journal.id}>
                      {journal.voucherNumber}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
        {documents.length === 0 ? <li className="text-sm text-muted">No documents filed for this company.</li> : null}
      </ul>
  </>);
}
