interface ScoreRingProps {
  value: number; // 0-100
  size?: number;
  label?: string;
}

function getColor(value: number): string {
  if (value >= 80) return '#10B981'; // Excelente/Excepcional
  if (value >= 70) return '#2563EB'; // Muito Bom
  if (value >= 60) return '#0EA5E9'; // Adequado
  if (value >= 50) return '#F59E0B'; // Atenção
  return '#EF4444'; // Crítico
}

export function ScoreRing({ value, size = 80, label }: ScoreRingProps) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value));
  const offset = circumference - (progress / 100) * circumference;
  const color = getColor(progress);

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={size * 0.28}
          fontWeight={600}
          fill="#0F172A"
        >
          {Math.round(progress)}
        </text>
      </svg>
      {label && <span className="text-xs text-p-neutral mt-1">{label}</span>}
    </div>
  );
}
