import type { ReactNode } from "react";

interface MetricsSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable metrics section wrapper with title
 */
export function MetricsSection({ title, children, className = "" }: MetricsSectionProps) {
  return (
    <div className={className}>
      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
