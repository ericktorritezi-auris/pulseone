interface ScoreBarsProps {
  items: { label: string; value: number; max?: number }[];
}

export function ScoreBars({ items }: ScoreBarsProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const max = item.max ?? 100;
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        return (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-p-neutral">{item.label}</span>
              <span className="font-medium text-p-primary-dark">{item.value.toFixed(1)}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-p-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
