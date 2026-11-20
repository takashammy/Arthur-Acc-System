import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell";
import { formatHkd } from "@/lib/accounting/money";
import { useLedger } from "@/lib/accounting/store";

export const Route = createFileRoute("/stock")({ component: StockPage });

export function StockPage() {
  const entityId = useLedger((s) => s.activeEntityId);
  const allStock = useLedger((s) => s.stock);
  const items = useMemo(() => allStock.filter((item) => item.entityId === entityId), [allStock, entityId]);
  const addStock = useLedger((s) => s.addStock);
  const moveStock = useLedger((s) => s.moveStock);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (<>
      <PageTitle
        kicker="Inventory"
        title="Inventory quantities, agreed to the general ledger."
        detail="A receipt debits inventory and credits cash, at weighted average cost. An issue debits cost of sales and credits inventory."
      />
      <ul className="space-y-3">
        {items.map((item) => (
          <StockRow key={item.id} item={item} onMove={moveStock} onNote={setNote} />
        ))}
        {items.length === 0 ? <li className="text-sm text-muted">No inventory items for this company.</li> : null}
      </ul>
      <section className="mt-4 flex flex-wrap gap-2">
        <input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Stock code" className="min-h-11 w-28 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Description" className="min-h-11 rounded-lg border border-line bg-panel px-3 text-sm" />
        <input value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Unit cost" inputMode="decimal" className="min-h-11 w-32 rounded-lg border border-line bg-panel px-3 text-sm" />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line px-4 text-sm"
          onClick={() =>
            void addStock(entityId, sku, name, Number(cost)).then((error) => {
              setNote(error ?? `Item added: ${sku}.`);
              if (!error) {
                setSku("");
                setName("");
                setCost("");
              }
            })
          }
        >
          Add item
        </button>
      </section>
      {note ? <p className="mt-3 text-sm text-pine">{note}</p> : null}
  </>);
}

function StockRow({
  item,
  onMove,
  onNote,
}: {
  item: { id: string; sku: string; name: string; qty: number; unitCost: number };
  onMove: (itemId: string, kind: "in" | "out", qty: number, unitCost: number, date: string) => Promise<string | null>;
  onNote: (note: string) => void;
}) {
  const [qty, setQty] = useState("10");
  const [unitCost, setUnitCost] = useState(String(item.unitCost || ""));
  const [date, setDate] = useState("2025-05-01");
  return (<>
    <li className="rounded-card border border-line bg-panel p-4 text-sm">
      <p className="font-medium">
        {item.sku} · {item.name}
      </p>
      <p className="mt-1 text-muted">
        {item.qty} on hand · unit cost {formatHkd(item.unitCost)} · carrying amount {formatHkd(item.qty * item.unitCost)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3" />
        <input value={qty} onChange={(event) => setQty(event.target.value)} className="min-h-11 w-20 rounded-lg border border-line bg-paper px-3" />
        <input value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="min-h-11 w-28 rounded-lg border border-line bg-paper px-3" />
        <button type="button" className="min-h-11 rounded-lg bg-pine px-4 text-panel" onClick={() => void onMove(item.id, "in", Number(qty), Number(unitCost), date).then((error) => onNote(error ?? "Goods received."))}>
          Goods received
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-4" onClick={() => void onMove(item.id, "out", Number(qty), Number(unitCost), date).then((error) => onNote(error ?? "Goods issued."))}>
          Goods issued
        </button>
      </div>
    </li>
  </>);
}
