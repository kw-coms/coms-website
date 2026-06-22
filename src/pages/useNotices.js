import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listNotices } from '../services/noticeApi.js'
import { queryKeys } from '../services/queryKeys.js'

const noticesQueryKey = queryKeys.notices.list()

export function useNotices() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: noticesQueryKey,
    queryFn: async () => {
      const data = await listNotices()
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
