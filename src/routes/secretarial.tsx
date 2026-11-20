import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { downloadNar1 } from "@/lib/accounting/export-returns";
import { agmMinutes, downloadText, writtenResolution } from "@/lib/accounting/filings";
import { signedBalance, trialBalance } from "@/lib/accounting/model";
import { formatHkd } from "@/lib/accounting/money";
import { useLedger } from "@/lib/accounting/store";
import { emptyPaper } from "@/lib/accounting/ledger.functions";

export const Route = createFileRoute("/secretarial")({ component: SecretarialPage });

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function anniversary(incorporated: string, year: number) {
  return `${year}-${incorporated.slice(5)}`;
}

export function SecretarialPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const entity = useLedger((s) => s.entities.find((item) => item.id === entityId));
  const accounts = useLedger((s) => s.accounts);
  const journals = useLedger((s) => s.journals);
  const allOfficers = useLedger((s) => s.officers);
  const officers = useMemo(
    () => allOfficers.filter((item) => item.entityId === entityId),
    [allOfficers, entityId],
  );
  const incorporated = entity?.incorporated ?? "2024-04-01";
  const returnDate = anniversary(incorporated, Number((entity?.yearEnd ?? "31 Mar 2026").slice(-4)) || 2026);
  const due = addDays(returnDate, 42);
  const yearEndDate = (() => {
    const label = entity?.yearEnd ?? "31 Mar 2026";
    const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
    const [day, mon, year] = label.split(" ");
    return `${year}-${months[mon] ?? "03"}-${day.padStart(2, "0")}`;
  })();
  const agmDue = addDays(yearEndDate, 275);
  const taxDue = yearEndDate.slice(5) === "03-31" ? `${yearEndDate.slice(0, 4)}-08-15` : addDays(yearEndDate, 30);
  const rows = trialBalance(accounts, journals, entityId);
  const capitalRow = rows.find((row) => row.account.code === "3000" || /share capital/i.test(row.account.name));
  const shareCapital = capitalRow ? signedBalance(capitalRow.account, capitalRow.balance) : 0;
  const stated = officers
    .filter((officer) => officer.role === "shareholder")
    .map((officer) => officer.detail.match(/[\d,]+/)?.[0])
    .filter(Boolean)
    .reduce((sum, value) => sum + Number(String(value).replace(/,/g, "")), 0);
  const capitalAgrees = Math.abs(stated - shareCapital) < 0.02;
  const saveOfficer = useLedger((s) => s.saveOfficer);
  const removeOfficer = useLedger((s) => s.removeOfficer);
  const papers = useLedger((s) => s.papers);
  const savePaper = useLedger((s) => s.savePaper);
  const paper = papers.find((item) => item.entityId === entityId) ?? emptyPaper(entityId);
  const [role, setRole] = useState<"director" | "shareholder" | "secretary">("director");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [appointed, setAppointed] = useState(incorporated);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const directors = officers.filter((officer) => officer.role === "director");
  const shareholders = officers.filter((officer) => officer.role === "shareholder");
  const secretary = officers.some((officer) => officer.role === "secretary");
  const checklist = [
    { ok: directors.length > 0 && shareholders.length > 0 && secretary, label: "Directors, members, and a company secretary are on the register" },
    { ok: Boolean(entity?.registeredOffice), label: "Registered office is recorded" },
    { ok: paper.resolutionDrafted, label: "Directors' written resolution has been drafted" },
    { ok: Boolean(paper.agmDate), label: paper.agmDate ? `AGM date set for ${paper.agmDate}` : "AGM date is not set" },
  ];
  const deadlines = [
    { name: "Annual return (NAR1)", date: due, note: "42 days after the anniversary of incorporation" },
    { name: "Profits tax return", date: taxDue, note: yearEndDate.slice(5) === "03-31" ? "Usual date for a 31 March year end, subject to a tax representative's extension" : "Illustrative, one month after the year end, subject to extension" },
    { name: "Annual general meeting", date: paper.agmDate || agmDue, note: "Within about nine months of the year end" },
  ];
  const reminders = [
    ...checklist.filter((item) => !item.ok).map((item) => item.label),
    ...deadlines.filter((item) => item.date <= addDays(new Date().toISOString().slice(0, 10), 90)).map((item) => `${item.name} falls on ${item.date}`),
  ];

  return (<>
      <PageTitle
        kicker="Company secretarial"
        title="Statutory registers and filing dates."
        detail={`${entity?.name ?? "The company"} · CR ${entity?.crNumber ?? "—"} · incorporated ${incorporated}. ${entity?.registeredOffice ?? "Registered office is not recorded."} This is a preparation pack, not a filing.`}
      />
      <section className="mb-4 rounded-card border border-line bg-panel p-4">
        <h2 className="font-serif text-xl">AGM and annual return</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {checklist.map((item) => (
            <li key={item.label} className={`flex items-start gap-2 ${item.ok ? "text-pine" : "text-seal"}`}>
              <span className={`mt-1 size-2 shrink-0 rounded-full ${item.ok ? "bg-pine" : "bg-seal"}`} />
              {item.label}
            </li>
          ))}
        </ul>
        {reminders.length ? (
          <ul className="mt-3 space-y-1 text-sm text-seal">
            {reminders.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : <p className="mt-3 text-sm text-pine">Nothing outstanding on the register or in the next 90 days.</p>}
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">AGM date</span>
          <input
            type="date"
            value={paper.agmDate}
            onChange={(event) => void savePaper({ ...paper, entityId, agmDate: event.target.value })}
            className="min-h-11 rounded-lg border border-line bg-paper px-3"
          />
        </label>
      </section>
      <section className="overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Registers</h2>
        <table className="w-full text-sm">
          <tbody>
            {officers.map((officer) => (
              <tr key={officer.id} className="border-t border-line">
                <td className="px-4 py-2 capitalize text-muted">{officer.role}</td>
                <td className="px-4 py-2">{officer.name}</td>
                <td className="px-4 py-2 text-muted">{officer.detail}</td>
                <td className="px-4 py-2 tabular text-muted">{officer.appointed}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="text-pine"
                    onClick={() => {
                      setEditing(officer.id);
                      setRole(officer.role);
                      setName(officer.name);
                      setDetail(officer.detail);
                      setAppointed(officer.appointed);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ml-3 text-seal" onClick={() => void removeOfficer(officer.id).then((error) => setNote(error ?? "Removed."))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`border-t border-line px-4 py-3 text-sm ${capitalAgrees ? "text-pine" : "text-seal"}`}>
          Share capital in the books is {formatHkd(shareCapital)}.
          {capitalAgrees ? " It agrees with the register of members." : " It does not agree with the register of members. Do not file until it does."}
        </p>
        <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
          <select value={role} onChange={(event) => setRole(event.target.value as "director" | "shareholder" | "secretary")} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm">
            <option value="director">Director</option>
            <option value="shareholder">Shareholder</option>
            <option value="secretary">Company secretary</option>
          </select>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="10,000 ordinary shares, or address" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <input type="date" value={appointed} onChange={(event) => setAppointed(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" />
          <button
            type="button"
            className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
            onClick={() =>
              void saveOfficer({ id: editing, entityId, role, name, detail, appointed }).then((error) => {
                setNote(error ?? (editing ? "Register updated." : "Added to the register."));
                if (!error) {
                  setEditing(undefined);
                  setName("");
                  setDetail("");
                }
              })
            }
          >
            {editing ? "Save changes" : "Add to the register"}
          </button>
        </div>
        {note ? <p className="px-4 pb-3 text-sm text-muted">{note}</p> : null}
      </section>
      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel">
        <h2 className="px-4 py-3 font-serif text-xl">Compliance calendar</h2>
        <ul>
          {deadlines.map((item) => (
            <li key={item.name} className="grid gap-1 border-t border-line px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
              <span className="tabular">{item.date}</span>
              <span>
                <span className="font-medium">{item.name}</span>
                <span className="text-muted"> — {item.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button
        type="button"
        disabled={!capitalAgrees}
        className="mt-4 min-h-11 rounded-lg bg-pine px-4 text-sm text-panel disabled:opacity-50"
        onClick={() =>
          downloadNar1({
            entityName: entity?.name ?? "Company",
            crNumber: entity?.crNumber ?? "",
            incorporated,
            madeUpTo: returnDate,
            due,
            office: entity?.registeredOffice ?? "",
            shareCapital,
            officers,
            capitalAgrees,
          })
        }
      >
        Export NAR1 working
      </button>
      {!capitalAgrees ? <p className="mt-2 text-sm text-seal">The stated share capital does not agree to the books, so the annual return working is held.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() => {
            downloadText(
              "directors-resolution.txt",
              writtenResolution({ entityName: entity?.name ?? "Company", crNumber: entity?.crNumber ?? "", yearEnd: entity?.yearEnd ?? "31 Mar 2026", directors }),
            );
            void savePaper({ ...paper, entityId, resolutionDrafted: true });
          }}
        >
          Draft directors' resolution
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() =>
            downloadText(
              "agm-minutes.txt",
              agmMinutes({
                entityName: entity?.name ?? "Company",
                crNumber: entity?.crNumber ?? "",
                yearEnd: entity?.yearEnd ?? "31 Mar 2026",
                heldOn: paper.agmDate || deadlines[2]?.date || "2026-12-31",
                directors,
                shareholders,
              }),
            )
          }
        >
          Draft AGM minutes
        </button>
      </div>
  </>);
}