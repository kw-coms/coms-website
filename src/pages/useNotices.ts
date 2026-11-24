import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listNotices, listPublicNotices } from '../services/noticeApi'
import { queryKeys } from '../services/queryKeys'
import { useAuth } from '../contexts/useAuth'

export function useNotices() {
  const { user, loading: authLoading, authError } = useAuth()
  const noticesQueryKey = queryKeys.notices.list(user?.studentId ?? 'guest')
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: noticesQueryKey,
    enabled: !authLoading && !authError,
    queryFn: async () => {
      const data = await (user ? listNotices() : listPublicNotices())
      return Array.isArray(data) ? data : []
    },
  })

  const setNotices = (updater) => {
    queryClient.setQueryData(noticesQueryKey, (prev) => {
      const current = Array.isArray(prev) ? prev : []
      return typeof updater === 'function' ? updater(current) : updater
    })
  }

  const refreshNotices = () => {
    queryClient.invalidateQueries({ queryKey: noticesQueryKey })
  }

  return {
    notices: query.data ?? [],
    setNotices,
    refreshNotices,
    loading: query.isPending,
    error: query.error ? (query.error.message || '공지사항을 불러오지 못했습니다.') : '',
  }
}
