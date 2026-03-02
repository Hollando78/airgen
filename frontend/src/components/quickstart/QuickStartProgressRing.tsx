interface QuickStartProgressRingProps {
  size: number;
  percent: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function QuickStartProgressRing({
  size,
  percent,
  strokeWidth = 3,
  showLabel = false,
}: QuickStartProgressRingProps): JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
      role="img"
      aria-label={`${percent}% complete`}
    >
      <title>{percent}% complete</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--neutral-200)"
        strokeWidth={strokeWidth}
        className="dark:opacity-30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--brand-500)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      {showLabel && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-neutral-700 dark:fill-neutral-200"
          style={{ fontSize: size * 0.24, fontWeight: 600 }}
        >
          {percent}%
        </text>
      )}
    </svg>
  );
}
