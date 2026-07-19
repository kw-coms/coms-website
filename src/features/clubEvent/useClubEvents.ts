import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/useAuth'
import { listClubEvents } from '../../services/clubEventApi'
import { CLUB_EVENTS_QUERY_KEY } from '../../shared/homeUi'

export function useClubEvents(loadErrorMessage) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLUB_EVENTS_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubEvents()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })

  const events = query.data ?? null
  const loading = Boolean(user && events === null && !query.error)
  const loadError = query.error ? (query.error.message || loadErrorMessage) : ''

  const prependEvent = (created) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => [created, ...(Array.isArray(prev) ? prev : [])])
  }

  const mergeEvent = (updated) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => {
      const list = Array.isArray(prev) ? prev : []
      const found = list.some((item) => item.id === updated.id)
      return found ? list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) : [updated, ...list]
    })
  }

  const removeEvent = (id) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => (Array.isArray(prev) ? prev.filter((item) => item.id !== id) : []))
  }

  return { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent }
}
