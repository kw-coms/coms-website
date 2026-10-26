import { useEffect } from 'react'
import { getCommunityShareLink } from '../../services/communityApi'

/**
 * The address-bar URL for an open post with its share signature (`?s=`) added, or `null` when
 * nothing should change: the reader has already moved to another page, or the URL already
 * carries this signature.
 *
 * Members share posts by copying the address bar. Link-preview crawlers (KakaoTalk, Slack, ...)
 * only get the post's own title and image when the link carries the signature; a bare
 * /community/123 shows a generic COM's card, so walking post numbers reveals nothing.
 */
export function addressWithShareSignature(
  location: { pathname: string; search: string; hash: string },
  postId: number,
  signature: string,
): string | null {
  const postPath = `/community/${postId}`
  if (location.pathname.replace(/\/+$/, '') !== postPath || !signature) return null
  const params = new URLSearchParams(location.search)
  if (params.get('s') === signature) return null
  params.set('s', signature)
  return `${postPath}?${params.toString()}${location.hash || ''}`
}

/** Puts the open post's share signature into the address bar so a copied URL previews properly. */
export function useShareSignatureInAddressBar(postId: number | null | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !postId) return undefined
    let cancelled = false
    getCommunityShareLink(postId)
      .then((link) => {
        if (cancelled || typeof window === 'undefined') return
        const next = addressWithShareSignature(window.location, postId, link?.signature)
        // replaceState, not navigate(): the route is unchanged, so nothing should re-render, and
        // the history entry stays the same one the reader opened.
        if (next) window.history.replaceState(window.history.state, '', next)
      })
      // Sharing still works without the signature (the preview is just generic), so a failure
      // here is not worth interrupting the reader for.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [postId, enabled])
}
