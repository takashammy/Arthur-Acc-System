import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { formatHkd } from "@/lib/accounting/money";
import { mpfSplit } from "@/lib/accounting/payroll";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/payroll")({ component: PayrollPage });

export function PayrollPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allEmployees = useLedger((s) => s.employees);
  const allSlips = useLedger((s) => s.paySlips);
  const employees = useMemo(() => allEmployees.filter((person) => person.entityId === entityId), [allEmployees, entityId]);
  const slips = useMemo(() => allSlips.filter((slip) => slip.entityId === entityId), [allSlips, entityId]);
  const addEmployee = useLedger((s) => s.addEmployee);
  const runPayroll = useLedger((s) => s.runPayroll);
  const [name, setName] = useState("");
  const [pay, setPay] = useState("");
  const [paidOn, setPaidOn] = useState("2025-04-30");
  const [note, setNote] = useState<string | null>(null);
  const preview = employees.map((person) => ({ person, ...mpfSplit(person.monthlyPay) }));

  return (<>
      <PageTitle
        kicker="Payroll"
        title="Payroll and Mandatory Provident Fund."
        detail="2026 mandatory rules: 5% from the employee and 5% from the employer. An employee with relevant income below HK$7,100 makes no contribution; the employer still contributes 5%. Neither contribution exceeds HK$1,500 a month."
      />
      <section className="overflow-hidden rounded-card border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-normal">Employee</th>
              <th className="px-4 py-2 font-normal">Gross</th>
              <th className="px-4 py-2 font-normal">Employee MPF</th>
              <th className="px-4 py-2 font-normal">Employer MPF</th>
              <th className="px-4 py-2 font-normal">Net</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.person.id} className="border-t border-line">
                <td className="px-4 py-2">{row.person.name}</td>
                <td className="px-4 py-2 tabular">{formatHkd(row.gross)}</td>
                <td className="px-4 py-2 tabular">{formatHkd(row.employee)}</td>
                <td className="px-4 py-2 tabular">{formatHkd(row.employer)}</td>
                <td className="px-4 py-2 tabular">{formatHkd(row.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Pay date
          <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="mt-1 block min-h-11 rounded-lg border border-line bg-panel px-3" />
        </label>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-pine px-4 text-sm text-panel"
          onClick={() => void runPayroll(entityId, paidOn).then((error) => setNote(error ?? `Payroll posted for ${paidOn}.`))}
        >
          Post payroll
        </button>
      </section>
      <section className="mt-4 flex flex-wrap gap-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Employee name" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={pay} onChange={(event) => setPay(event.target.value)} placeholder="Monthly relevant income" inputMode="decimal" className="min-h-11 w-36 rounded-lg border border-line bg-panel px-3 text-sm" />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() =>
            void addEmployee(entityId, name, Number(pay)).then((error) => {
              setNote(error ?? `Employee added: ${name}.`);
              if (!error) {
                setName("");
                setPay("");
              }
            })
          }
        >
          Add employee
        </button>
      </section>
      {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
      <ul className="mt-6 space-y-2 text-sm">
        {slips.map((slip) => (
          <li key={slip.id} className="rounded-card border border-line bg-panel px-4 py-3">
            {slip.paidOn} · gross pay {formatHkd(slip.gross)} · net pay {formatHkd(slip.net)}
          </li>
        ))}
      </ul>
  </>);
}
