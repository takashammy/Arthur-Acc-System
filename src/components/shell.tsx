import { go } from "@/lib/accounting/nav";
import { Banknote, BookOpen, Boxes, Building2, ClipboardCheck, Combine, FileSpreadsheet, KeyRound, Landmark, Library, ListChecks, Lock, LockOpen, Paperclip, Receipt, Scale, ScrollText, Shield, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLedger } from "@/lib/accounting/store";

const NAV = [
  { to: "/", label: "Overview", icon: BookOpen },
  { to: "/journals", label: "Journals", icon: ScrollText },
  { to: "/reports", label: "Reports", icon: Scale },
  { to: "/import", label: "Import", icon: FileSpreadsheet },
  { to: "/bank", label: "Bank", icon: Landmark },
  { to: "/ledgers", label: "Subledgers", icon: Library },
  { to: "/payroll", label: "Payroll", icon: Banknote },
  { to: "/stock", label: "Inventory", icon: Boxes },
  { to: "/leases", label: "Leases", icon: KeyRound },
  { to: "/group", label: "Consolidation", icon: Combine },
  { to: "/documents", label: "Documents", icon: Paperclip },
  { to: "/tax", label: "Profits tax", icon: Receipt },
  { to: "/secretarial", label: "Secretarial", icon: Building2 },
  { to: "/close", label: "Period close", icon: ListChecks },
  { to: "/review", label: "Review", icon: ClipboardCheck },
  { to: "/client", label: "Client portal", icon: Users },
  { to: "/auditor", label: "Auditor", icon: Shield },
] as const;

export function Shell({ children, path }: { children: ReactNode; path: string }) {
  const load = useLedger((s) => s.load);
  const hydrated = useLedger((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);
  return <ShellFrame path={path}>{children}</ShellFrame>;
}

function ShellFrame({ children, path }: { children: ReactNode; path: string }) {
  const entityId = useLedger((s) => s.activeEntityId);
  const setEntity = useLedger((s) => s.setEntity);
  const periods = useLedger((s) => s.periods);
  const period = periods.find((p) => p.entityId === entityId);
  const entities = useLedger((s) => s.entities);
  const firmName = useLedger((s) => s.firmName);
  const role = useLedger((s) => s.role);
  const setRole = useLedger((s) => s.setRole);
  const [roleNote, setRoleNote] = useState<string | null>(null);
  const [resume, setResume] = useState("");
  const [cyber, setCyber] = useState(false);
  const hydrated = useLedger((s) => s.hydrated);
  const entity = entities.find((e) => e.id === entityId);

  useEffect(() => {
    setCyber(document.documentElement.dataset.theme === "cyber");
  }, []);

  function toggleTheme() {
    const next = !cyber;
    setCyber(next);
    document.documentElement.dataset.theme = next ? "cyber" : "";
    if (!next) delete document.documentElement.dataset.theme;
    localStorage.setItem("arthur.theme", next ? "cyber" : "classic");
  }

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[15.5rem_1fr]">
      <aside className="border-b border-line bg-panel md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-end justify-between gap-4 px-5 py-5 md:block">
          <div>
            <p className="font-serif text-2xl leading-none tracking-tight">Arthur</p>
            <p className="mt-1 text-xs tracking-[0.16em] text-muted uppercase">{firmName || "Hong Kong practice"} · v1.0</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3">
          {NAV.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => go(item.to)}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm ${
                  active ? "bg-pine text-panel" : "text-ink hover:bg-paper"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-8">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] tracking-[0.14em] text-muted uppercase">Company</span>
            <select
              value={entityId}
              onChange={(e) => setEntity(e.target.value)}
              className="min-h-11 max-w-md rounded-lg border border-line bg-panel px-3 text-sm"
            >
              {entities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={cyber}
              className="min-h-9 rounded-lg border border-line bg-panel px-3 text-xs"
            >
              {cyber ? "Classic" : "Cyberpunk"}
            </button>
            <label>
              <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Acting as</p>
              <select
                value={role}
                disabled={role !== "partner"}
                onChange={(event) => {
                  const next = event.target.value as "partner" | "reviewer" | "preparer";
                  void setRole(next).then((error) => setRoleNote(error));
                }}
                className="min-h-9 rounded-lg border border-line bg-panel px-2 text-sm capitalize disabled:opacity-70"
              >
                <option value="partner">Partner</option>
                <option value="reviewer">Reviewer</option>
                <option value="preparer">Preparer</option>
              </select>
              {role !== "partner" ? (
                <span className="mt-1 flex items-center gap-1">
                  <input
                    value={resume}
                    onChange={(event) => setResume(event.target.value)}
                    placeholder="Type partner to resume"
                    className="min-h-8 w-36 rounded-lg border border-line bg-panel px-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={resume.trim().toLowerCase() !== "partner"}
                    className="min-h-8 rounded-lg border border-line px-2 text-xs disabled:opacity-50"
                    onClick={() => {
                      void setRole("partner", true).then((error) => {
                        setRoleNote(error);
                        if (!error) setResume("");
                      });
                    }}
                  >
                    Resume
                  </button>
                </span>
              ) : (
                <span className="mt-1 block text-[11px] text-muted">Only a partner can change this.</span>
              )}
              {roleNote ? <span className="mt-1 block text-[11px] text-seal">{roleNote}</span> : null}
            </label>
            <div>
              <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Period</p>
              <p className="tabular">
                {period?.label ?? (hydrated ? "—" : "Loading")} · Year end {entity?.yearEnd ?? "—"}
              </p>
            </div>
            <span
              className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs ${
                period?.status === "locked" ? "bg-warn-bg text-brass" : "bg-pine-soft text-pine"
              }`}
            >
              {period?.status === "locked" ? <Lock size={13} /> : <LockOpen size={13} />}
              {hydrated ? (period?.status === "locked" ? "Locked" : "Open") : "Loading"}
            </span>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ kicker, title, detail }: { kicker: string; title: string; detail?: string }) {
  return (
    <div className="mb-6 max-w-3xl">
      <p className="text-[11px] tracking-[0.16em] text-muted uppercase">{kicker}</p>
      <h1 className="mt-1 font-serif text-3xl leading-tight md:text-4xl">{title}</h1>
      {detail ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{detail}</p> : null}
    </div>
  );
}
