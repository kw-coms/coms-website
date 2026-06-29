import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toggleBookmark } from '../../services/communityApi'
import { queryKeys } from '../../services/queryKeys'
import { showToast } from '../../components/common/Toast'

// Every community post list (main board, 내 스크랩, member profile) shares the
// same CommunityPostResponse row shape, so a bookmark toggle has to patch the
// `bookmarked` flag wherever that post id currently lives in the cache. We match
// the existing vote pattern (server returns the source of truth) but layer an
// optimistic toggle on top per the feature brief.

function patchPostInArrayCache(queryClient, queryKey, postId, bookmarked) {
  queryClient.setQueryData(queryKey, (prev) => {
    if (!Array.isArray(prev)) return prev
    return prev.map((item) => (item.id === postId ? { ...item, bookmarked } : item))
  })
}

function setBookmarkEverywhere(queryClient, postId, bookmarked) {
  patchPostInArrayCache(queryClient, queryKeys.community.posts(), postId, bookmarked)
  // The bookmarks list and any loaded author lists are arrays too; patch the
  // active query of each so the icon stays in sync without a refetch flash.
  queryClient
    .getQueryCache()
    .findAll({ queryKey: queryKeys.community.bookmarks() })
    .forEach((query) => patchPostInArrayCache(queryClient, query.queryKey, postId, bookmarked))
  queryClient
    .getQueryCache()
    .findAll({ queryKey: [...queryKeys.community.all, 'by-author'] })
    .forEach((query) => patchPostInArrayCache(queryClient, query.queryKey, postId, bookmarked))
}

export function useBookmarkMutation(options = {}) {
  const { onToggled } = options as { onToggled?: (postId: number, bookmarked: boolean) => void }
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (post: any) => {
      const result = await toggleBookmark(post.id)
      return { postId: post.id, bookmarked: Boolean(result?.bookmarked) }
    },
    onMutate: async (post: any) => {
      const previous = Boolean(post.bookmarked)
      const optimistic = !previous
      setBookmarkEverywhere(queryClient, post.id, optimistic)
      onToggled?.(post.id, optimistic)
      return { postId: post.id, previous }
    },
    onError: (err: any, _post, context: any) => {
      if (context) {
        setBookmarkEverywhere(queryClient, context.postId, context.previous)
        onToggled?.(context.postId, context.previous)
      }
      showToast({ message: err?.message || '스크랩 처리 중 오류가 발생했습니다.', tone: 'error' })
    },
    onSuccess: ({ postId, bookmarked }) => {
      // Reconcile with the server's authoritative value.
      setBookmarkEverywhere(queryClient, postId, bookmarked)
      onToggled?.(postId, bookmarked)
      showToast({ message: bookmarked ? '스크랩했습니다.' : '스크랩을 해제했습니다.', tone: 'success' })
    },
    onSettled: () => {
      // Refresh the 내 스크랩 list so unbookmarked posts drop out of it.
      queryClient.invalidateQueries({ queryKey: queryKeys.community.bookmarks() })
    },
  })
}
