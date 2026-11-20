import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageTitle } from "@/components/shell";
import { useLedger } from "@/lib/accounting/store";
import { emptyPaper, type ReviewStatus } from "@/lib/accounting/ledger.functions";

export const Route = createFileRoute("/review")({ component: ReviewPage });

const LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  submitted: "Under review",
  returned: "Returned",
  reviewed: "Reviewed",
  signed: "Signed",
  released: "Released to the client",
};

export function ReviewPage() {
  const entities = useLedger((s) => s.entities);
  const reviews = useLedger((s) => s.reviews);
  const requests = useLedger((s) => s.requests);
  const setEntity = useLedger((s) => s.setEntity);

  return (<>
      <PageTitle
        kicker="Review"
        title="Submit, review, sign, then release."
        detail="A file may be submitted only when the trial balance and the balance sheet agree. Signing locks the undated period. A journal after signature must be narrated as a post-sign adjustment and sends the file back for review."
      />
      <ul className="space-y-4">
        {entities.map((entity) => {
          const review = reviews.find((item) => item.entityId === entity.id) ?? {
            entityId: entity.id,
            status: "draft" as const,
            note: "",
          };
          const open = requests.filter((item) => item.entityId === entity.id && item.status === "open").length;
          return (
            <li key={entity.id}>
              <ReviewCard
                name={entity.name}
                entityId={entity.id}
                status={review.status}
                note={review.note}
                openRequests={open}
                onFocus={() => setEntity(entity.id)}
              />
            </li>
          );
        })}
      </ul>
  </>);
}

function ReviewCard({
  name,
  entityId,
  status,
  note,
  openRequests,
  onFocus,
}: {
  name: string;
  entityId: string;
  status: ReviewStatus;
  note: string;
  openRequests: number;
  onFocus: () => void;
}) {
  const setReview = useLedger((s) => s.setReview);
  const addRequest = useLedger((s) => s.addRequest);
  const role = useLedger((s) => s.role);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const [comment, setComment] = useState("");
  const [ask, setAsk] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run(action: "submit" | "return" | "review" | "sign" | "release") {
    if (action === "return" && !comment.trim()) {
      setFailed(true);
      setMessage("A note is required when a file is returned.");
      return;
    }
    onFocus();
    const error = await setReview(entityId, action, comment);
    setFailed(Boolean(error));
    setMessage(error ?? LABEL[action === "submit" ? "submitted" : action === "return" ? "returned" : action === "review" ? "reviewed" : action === "sign" ? "signed" : "released"]);
    if (!error && comment.trim()) {
      await savePaper({
        ...paper,
        entityId,
        thread: [...paper.thread, { at: new Date().toISOString(), role, text: comment.trim() }],
      });
      setComment("");
    }
  }

  return (<>
    <article className="rounded-card border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl">{name}</h2>
        <span className="text-sm text-pine">{LABEL[status]}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{openRequests === 0 ? "No outstanding requests from the client." : `${openRequests} outstanding request${openRequests === 1 ? "" : "s"} with the client.`}</p>
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
      {paper.thread.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {paper.thread.map((item) => (
            <li key={item.at + item.text}><span className="text-muted">{item.at.slice(0, 10)} · {item.role}</span> — {item.text}</li>
          ))}
        </ul>
      ) : null}
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
        placeholder="Review note. Required when returning a file."
        className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {(status === "draft" || status === "returned") && role !== "reviewer" ? (
          <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void run("submit")}>
            Submit for review
          </button>
        ) : null}
        {status === "submitted" && role !== "preparer" ? (
          <>
            <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void run("review")}>
              Mark as reviewed
            </button>
            <button type="button" className="min-h-11 rounded-lg border border-line px-4 text-sm" disabled={!comment.trim()} onClick={() => void run("return")}>
              Return to preparer
            </button>
          </>
        ) : null}
        {status === "reviewed" && role === "partner" ? (
          <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void run("sign")}>
            Sign and lock the period
          </button>
        ) : null}
        {status === "signed" && role === "partner" ? (
          <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel" onClick={() => void run("release")}>
            Release to the client
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={ask} onChange={(event) => setAsk(event.target.value)} placeholder="Ask the client for…" className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-sm" />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() => {
            onFocus();
            void addRequest(entityId, ask).then((error) => {
              setFailed(Boolean(error));
              setMessage(error ?? "Request recorded.");
              if (!error) setAsk("");
            });
          }}
        >
          Raise a request
        </button>
      </div>
      {message ? <p className={`mt-2 text-sm ${failed ? "text-seal" : "text-pine"}`}>{message}</p> : null}
    </article>
  </>);
}
