import { QueryClient } from '@tanstack/react-query'
import type { ApiError } from './apiClient'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s fresh → no thrashing on tab switches / re-mounts.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: Error) => {
        const status = (error as Partial<ApiError>)?.status
        if (status === 401 || status === 403) return false
        return failureCount < 2
      },
    },
  },
})
