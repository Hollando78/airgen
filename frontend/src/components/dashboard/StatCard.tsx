import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  color?: string;
  percentage?: number;
  className?: string;
}

/**
 * Reusable stat card component for displaying metrics
 */
export function StatCard({ label, value, color, percentage, className = "" }: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {percentage !== undefined && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
          {percentage}%
        </div>
      )}
    </div>
  );
}
