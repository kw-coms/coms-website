import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listCommunityPosts } from '../../services/communityApi.js'
import { queryKeys } from '../../services/queryKeys.js'

const communityPostsQueryKey = queryKeys.community.posts()

export function useCommunityPosts() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: communityPostsQueryKey,
    queryFn: async () => {
      const data = await listCommunityPosts()
      return Array.isArray(data) ? data : []
    },
  })

  const setPosts = (updater) => {
    queryClient.setQueryData(communityPostsQueryKey, (prev) => {
      const current = Array.isArray(prev) ? prev : []
      return typeof updater === 'function' ? updater(current) : updater
    })
  }

  return {
    posts: query.data ?? [],
    setPosts,
    loading: query.isPending,
    error: query.error ? (query.error.message || '커뮤니티 글을 불러오지 못했습니다.') : '',
  }
}
