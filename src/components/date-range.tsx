export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
      <label>
        <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">From</span>
        <input
          type="date"
          value={from}
          onChange={(event) => onChange(event.target.value, to)}
          className="min-h-11 rounded-lg border border-line bg-panel px-3"
        />
      </label>
      <label>
        <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">To</span>
        <input
          type="date"
          value={to}
          onChange={(event) => onChange(from, event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-panel px-3"
        />
      </label>
    </div>
  );
}

export function AsAt({ value, onChange, label = "As at" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1 block text-[11px] tracking-[0.14em] text-muted uppercase">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line bg-panel px-3"
      />
    </label>
  );
}

export const chartTooltip = {
  cursor: { fill: "var(--chart-cursor)" },
  contentStyle: {
    background: "var(--chart-tip)",
    border: "1px solid var(--chart-tip-border)",
    borderRadius: 8,
    color: "var(--color-ink)",
  },
};
