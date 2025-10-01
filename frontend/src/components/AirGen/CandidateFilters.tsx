import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

/**
 * Props for the CandidateFilters component
 */
export interface CandidateFiltersProps {
  /** Current text filter value */
  textFilter: string;
  /** Current sort order */
  sortOrder: 'newest' | 'oldest';
  /** Handler for text filter change */
  onTextFilterChange: (value: string) => void;
  /** Handler for sort order change */
  onSortOrderChange: (order: 'newest' | 'oldest') => void;
}

/**
 * Filter controls for candidate requirements and diagrams,
 * including text search and sort order selection
 */
export function CandidateFilters({
  textFilter,
  sortOrder,
  onTextFilterChange,
  onSortOrderChange
}: CandidateFiltersProps): JSX.Element {
  return (
    <div className="results-actions">
      <Input
        type="search"
        placeholder="Filter by text"
        value={textFilter}
        onChange={event => onTextFilterChange(event.target.value)}
        aria-label="Filter candidates"
        className="max-w-xs"
      />
      <Select value={sortOrder} onValueChange={(value) => onSortOrderChange(value as 'newest' | 'oldest')}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
