/**
 * ActivityCard Component
 *
 * Displays a single activity event in card format
 */

import {
  FileText,
  ListChecks,
  Box,
  Network,
  GitBranch,
  Image,
  Layers,
  Link as LinkIcon,
  Package,
  AlertCircle
} from 'lucide-react';
import type { ActivityEvent } from '../../types';

interface ActivityCardProps {
  event: ActivityEvent;
}

// Icon mapping for activity types
const activityIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  requirement: ListChecks,
  document: FileText,
  section: FileText,
  block: Box,
  diagram: Network,
  connector: GitBranch,
  port: GitBranch,
  package: Package,
  candidate: AlertCircle,
  'diagram-candidate': Network,
  imagine: Image,
  baseline: Layers,
  link: LinkIcon
};

// Color mapping for activity types
const activityColors: Record<string, string> = {
  requirement: 'text-blue-600 bg-blue-50 border-blue-200',
  document: 'text-purple-600 bg-purple-50 border-purple-200',
  section: 'text-purple-500 bg-purple-50 border-purple-200',
  block: 'text-green-600 bg-green-50 border-green-200',
  diagram: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  connector: 'text-teal-600 bg-teal-50 border-teal-200',
  port: 'text-teal-500 bg-teal-50 border-teal-200',
  package: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  candidate: 'text-amber-600 bg-amber-50 border-amber-200',
  'diagram-candidate': 'text-cyan-500 bg-cyan-50 border-cyan-200',
  imagine: 'text-pink-600 bg-pink-50 border-pink-200',
  baseline: 'text-slate-600 bg-slate-50 border-slate-200',
  link: 'text-orange-600 bg-orange-50 border-orange-200'
};

// Action badge colors
const actionColors: Record<string, string> = {
  created: 'bg-green-100 text-green-800',
  updated: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 text-gray-800',
  restored: 'bg-teal-100 text-teal-800',
  deleted: 'bg-red-100 text-red-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  generated: 'bg-purple-100 text-purple-800'
};

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

export function ActivityCard({ event }: ActivityCardProps): JSX.Element {
  const IconComponent = activityIcons[event.activityType] || AlertCircle;
  const colorClass = activityColors[event.activityType] || 'text-gray-600 bg-gray-50 border-gray-200';
  const actionColorClass = actionColors[event.actionType] || 'bg-gray-100 text-gray-800';

  const relativeTime = formatRelativeTime(event.timestamp);
  const absoluteTime = new Date(event.timestamp).toLocaleString();

  return (
    <div className="activity-card">
      <div className="activity-card-header">
        <div className="activity-card-icon-container">
          <div className={`activity-card-icon ${colorClass}`}>
            <IconComponent size={16} />
          </div>
        </div>

        <div className="activity-card-content">
          <div className="activity-card-title">
            <span className="activity-type-label">{event.activityType}</span>
            <span className="entity-name">
              {event.entityRef && <span className="entity-ref">{event.entityRef}</span>}
              {event.entityName}
            </span>
            <span className={`action-badge ${actionColorClass}`}>
              {event.actionType}
            </span>
          </div>

          {event.description && (
            <div className="activity-description">
              {event.description}
            </div>
          )}

          <div className="activity-card-footer">
            <span className="user-attribution">
              {event.userName || event.userId}
            </span>
            <span className="activity-time" title={absoluteTime}>
              {relativeTime}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .activity-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          transition: all 0.2s ease;
        }

        .activity-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .activity-card-header {
          display: flex;
          gap: 12px;
        }

        .activity-card-icon-container {
          flex-shrink: 0;
        }

        .activity-card-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid;
        }

        .activity-card-content {
          flex: 1;
          min-width: 0;
        }

        .activity-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }

        .activity-type-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
        }

        .entity-name {
          font-size: 14px;
          font-weight: 500;
          color: #0f172a;
          word-break: break-word;
        }

        .entity-ref {
          display: inline-block;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 13px;
          padding: 2px 6px;
          background: #f1f5f9;
          border-radius: 4px;
          margin-right: 6px;
          color: #475569;
        }

        .action-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .activity-description {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 8px;
          line-height: 1.5;
        }

        .activity-card-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          color: #94a3b8;
        }

        .user-attribution {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .user-attribution::before {
          content: '👤';
          font-size: 10px;
        }

        .activity-time {
          cursor: help;
        }
      `}</style>
    </div>
  );
}
