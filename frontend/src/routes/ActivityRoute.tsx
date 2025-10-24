/**
 * ActivityRoute Component
 *
 * Displays a chronological timeline of all notable events in the system
 * Includes filtering, infinite scroll, and statistics
 */

import { useState } from 'react';
import { useActivityFeed, useActivityStats } from '../hooks/useActivityApi';
import type { UseActivityFilters } from '../hooks/useActivityApi';
import { ActivityCard } from '../components/activity/ActivityCard';
import { ActivityFilters, ActivityFilterState } from '../components/activity/ActivityFilters';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Loader2, Activity as ActivityIcon, TrendingUp } from 'lucide-react';

export function ActivityRoute(): JSX.Element {
  // Filter state
  const [filters, setFilters] = useState<ActivityFilterState>({
    activityTypes: [],
    actionTypes: [],
    searchQuery: ''
  });

  // Convert filter state to API format
  const apiFilters: UseActivityFilters = {
    activityTypes: filters.activityTypes.length > 0 ? filters.activityTypes : undefined,
    actionTypes: filters.actionTypes.length > 0 ? filters.actionTypes : undefined,
    searchQuery: filters.searchQuery || undefined
  };

  // Data queries
  const activityQuery = useActivityFeed(apiFilters);
  const statsQuery = useActivityStats();

  // Flatten pages into single array
  const allEvents = activityQuery.data?.pages.flatMap(page => page.events) || [];
  const hasMore = activityQuery.hasNextPage;
  const isLoadingMore = activityQuery.isFetchingNextPage;

  // Empty state check
  const isEmptyState = !activityQuery.isLoading && allEvents.length === 0;
  const hasActiveFilters = filters.activityTypes.length > 0 ||
                          filters.actionTypes.length > 0 ||
                          filters.searchQuery !== '';

  return (
    <PageLayout
      title="Activity Timeline"
      description="Chronological view of all project events and changes"
      breadcrumbs={[
        { label: 'Workspace' },
        { label: 'Activity' }
      ]}
    >
      {/* Statistics Overview */}
      {statsQuery.data && (
        <div className="mb-6">
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp size={20} />
                Activity Statistics
              </CardTitle>
              <CardDescription>
                Project activity summary over the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-700">
                    {statsQuery.data.totalEvents}
                  </div>
                  <div className="text-sm text-blue-600 mt-1">Total Events</div>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-2xl font-bold text-green-700">
                    {statsQuery.data.eventsByAction.created || 0}
                  </div>
                  <div className="text-sm text-green-600 mt-1">Created</div>
                </div>

                <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-2xl font-bold text-amber-700">
                    {statsQuery.data.eventsByAction.updated || 0}
                  </div>
                  <div className="text-sm text-amber-600 mt-1">Updated</div>
                </div>

                <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-2xl font-bold text-purple-700">
                    {statsQuery.data.activeUsers}
                  </div>
                  <div className="text-sm text-purple-600 mt-1">Active Users</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <ActivityFilters filters={filters} onChange={setFilters} />

      {/* Activity Feed */}
      <PageHeader
        title="Recent Activity"
        description={
          allEvents.length > 0
            ? `Showing ${allEvents.length} event${allEvents.length !== 1 ? 's' : ''}`
            : 'No events to display'
        }
      />

      {/* Loading state */}
      {activityQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <span className="ml-3 text-neutral-600">Loading activity...</span>
        </div>
      )}

      {/* Error state */}
      {activityQuery.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8">
            <div className="text-center text-red-700">
              <ActivityIcon size={48} className="mx-auto mb-3 opacity-50" />
              <p className="font-semibold">Failed to load activity</p>
              <p className="text-sm mt-2">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : 'An unexpected error occurred'}
              </p>
              <Button
                onClick={() => activityQuery.refetch()}
                className="mt-4"
                variant="outline"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {isEmptyState && (
        <Card className="border-neutral-200 bg-white">
          <CardContent className="py-16">
            <div className="text-center text-neutral-600">
              <ActivityIcon size={48} className="mx-auto mb-3 opacity-40" />
              {hasActiveFilters ? (
                <>
                  <p className="font-semibold text-neutral-800">No matching activity found</p>
                  <p className="text-sm mt-2">
                    Try adjusting your filters or clearing them to see all events
                  </p>
                  <Button
                    onClick={() => setFilters({ activityTypes: [], actionTypes: [], searchQuery: '' })}
                    className="mt-4"
                    variant="outline"
                  >
                    Clear All Filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-semibold text-neutral-800">No activity yet</p>
                  <p className="text-sm mt-2">
                    Activity will appear here as you create and modify items in your project
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity cards */}
      {allEvents.length > 0 && (
        <div className="space-y-0">
          {allEvents.map((event) => (
            <ActivityCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <div className="mt-6 text-center">
          <Button
            onClick={() => activityQuery.fetchNextPage()}
            disabled={isLoadingMore}
            variant="outline"
            className="min-w-[200px]"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Loading more...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* End indicator */}
      {!hasMore && allEvents.length > 0 && (
        <div className="mt-8 text-center text-sm text-neutral-500 py-4 border-t border-neutral-200">
          You've reached the end of the activity timeline
        </div>
      )}
    </PageLayout>
  );
}
