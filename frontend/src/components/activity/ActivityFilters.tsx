/**
 * ActivityFilters Component
 *
 * Filter controls for activity timeline
 */

import { useState } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { ActivityType, ActionType } from '../../types';

export interface ActivityFilterState {
  activityTypes: ActivityType[];
  actionTypes: ActionType[];
  searchQuery: string;
}

interface ActivityFiltersProps {
  filters: ActivityFilterState;
  onChange: (filters: ActivityFilterState) => void;
}

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'requirement', label: 'Requirements' },
  { value: 'document', label: 'Documents' },
  { value: 'block', label: 'Blocks' },
  { value: 'diagram', label: 'Diagrams' },
  { value: 'connector', label: 'Connectors' },
  { value: 'candidate', label: 'Candidates' },
  { value: 'imagine', label: 'Imagine Images' },
  { value: 'baseline', label: 'Baselines' },
  { value: 'link', label: 'Trace Links' }
];

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'archived', label: 'Archived' },
  { value: 'restored', label: 'Restored' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'generated', label: 'Generated' }
];

export function ActivityFilters({ filters, onChange }: ActivityFiltersProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleActivityType = (type: ActivityType) => {
    const newTypes = filters.activityTypes.includes(type)
      ? filters.activityTypes.filter(t => t !== type)
      : [...filters.activityTypes, type];
    onChange({ ...filters, activityTypes: newTypes });
  };

  const toggleActionType = (action: ActionType) => {
    const newActions = filters.actionTypes.includes(action)
      ? filters.actionTypes.filter(a => a !== action)
      : [...filters.actionTypes, action];
    onChange({ ...filters, actionTypes: newActions });
  };

  const clearAllFilters = () => {
    onChange({
      activityTypes: [],
      actionTypes: [],
      searchQuery: ''
    });
  };

  const activeFilterCount = filters.activityTypes.length + filters.actionTypes.length + (filters.searchQuery ? 1 : 0);

  return (
    <div className="activity-filters">
      {/* Search Bar */}
      <div className="search-container">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search by entity name or ref..."
          value={filters.searchQuery}
          onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
          className="search-input"
        />
        {filters.searchQuery && (
          <button
            onClick={() => onChange({ ...filters, searchQuery: '' })}
            className="clear-search-button"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter Toggle Button */}
      <div className="filter-toggle-container">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="filter-toggle-button"
        >
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="filter-count-badge">{activeFilterCount}</span>
          )}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters} className="clear-all-button">
            Clear all
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="filters-panel">
          <div className="filter-section">
            <h4 className="filter-section-title">Entity Types</h4>
            <div className="filter-options">
              {ACTIVITY_TYPES.map(({ value, label }) => (
                <label key={value} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.activityTypes.includes(value)}
                    onChange={() => toggleActivityType(value)}
                    className="filter-checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <h4 className="filter-section-title">Action Types</h4>
            <div className="filter-options">
              {ACTION_TYPES.map(({ value, label }) => (
                <label key={value} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.actionTypes.includes(value)}
                    onChange={() => toggleActionType(value)}
                    className="filter-checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .activity-filters {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .search-container {
          position: relative;
          margin-bottom: 12px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 10px 36px 10px 36px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .clear-search-button {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          padding: 4px;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .clear-search-button:hover {
          background: #f1f5f9;
          color: #475569;
        }

        .filter-toggle-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-toggle-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-toggle-button:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .filter-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          background: #3b82f6;
          color: white;
          font-size: 11px;
          font-weight: 600;
          border-radius: 10px;
        }

        .clear-all-button {
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 6px;
          font-size: 13px;
          color: #dc2626;
          cursor: pointer;
          transition: all 0.2s;
        }

        .clear-all-button:hover {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .filters-panel {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        @media (max-width: 768px) {
          .filters-panel {
            grid-template-columns: 1fr;
          }
        }

        .filter-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .filter-section-title {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .filter-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #475569;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .filter-checkbox-label:hover {
          background: #f8fafc;
        }

        .filter-checkbox {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1.5px solid #cbd5e1;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-checkbox:checked {
          accent-color: #3b82f6;
        }
      `}</style>
    </div>
  );
}
