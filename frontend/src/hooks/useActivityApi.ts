/**
 * useActivityApi Hook
 *
 * React Query hook for activity timeline data fetching
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../lib/client';
import { useTenantProject } from './useTenantProject';
import type { ActivityFilters, ActivityType, ActionType } from '../types';

export interface UseActivityFilters {
  activityTypes?: ActivityType[];
  actionTypes?: ActionType[];
  userIds?: string[];
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export function useActivityFeed(filters?: UseActivityFilters) {
  const api = useApiClient();
  const { state } = useTenantProject();

  return useInfiniteQuery({
    queryKey: ['activity', state.tenant, state.project, filters],
    queryFn: ({ pageParam = 0 }) => {
      if (!state.tenant || !state.project) {
        throw new Error('Tenant and project must be selected');
      }

      const activityFilters: ActivityFilters = {
        tenantSlug: state.tenant,
        projectSlug: state.project,
        activityTypes: filters?.activityTypes,
        actionTypes: filters?.actionTypes,
        userIds: filters?.userIds,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
        searchQuery: filters?.searchQuery,
        limit: 50,
        offset: pageParam
      };

      return api.listActivity(activityFilters);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: Boolean(state.tenant && state.project),
    staleTime: 30000 // 30 seconds
  });
}

export function useActivityStats() {
  const api = useApiClient();
  const { state } = useTenantProject();

  return useQuery({
    queryKey: ['activity-stats', state.tenant, state.project],
    queryFn: () => {
      if (!state.tenant || !state.project) {
        throw new Error('Tenant and project must be selected');
      }
      return api.getActivityStats(state.tenant, state.project);
    },
    enabled: Boolean(state.tenant && state.project),
    staleTime: 60000 // 1 minute
  });
}
