interface ProgressBarProps {
  value: number; // 0-100
  showLabel?: boolean;
}

export function ProgressBar({ value, showLabel = true }: ProgressBarProps) {
  const progress = Math.max(0, Math.min(100, value));

  return (
    <div className="w-full">
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-p-primary rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      {showLabel && <span className="text-xs text-p-neutral mt-1 block">{Math.round(progress)}%</span>}
    </div>
  );
}
