import { useQuery } from '@tanstack/react-query'
import { getAdminAnalytics } from '../../services/adminApi'
import { queryKeys } from '../../services/queryKeys'

const adminAnalyticsQueryKey = queryKeys.admin.analytics()

export function useAdminAnalytics() {
  const query = useQuery({
    queryKey: adminAnalyticsQueryKey,
    queryFn: () => getAdminAnalytics(),
    staleTime: 60_000,
  })

  return {
    analytics: query.data ?? null,
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error ? (query.error.message || '분석 데이터를 불러오지 못했습니다.') : '',
    refetch: query.refetch,
  }
}
