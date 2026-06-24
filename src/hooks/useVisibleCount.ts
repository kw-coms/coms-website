import { useState } from 'react'

// Tiny client-side incremental rendering helper. Renders `step` items at a time
// and reveals another `step` on each loadMore(). Pass a `resetKey` (e.g. the
// active search/filter signature) so the visible window snaps back to `step`
// whenever the underlying list changes.
export function useVisibleCount(total: number, step = 20, resetKey?: unknown) {
  const [visible, setVisible] = useState(step)
  const [lastKey, setLastKey] = useState(resetKey)

  // Reset during render (React's recommended pattern over a setState effect):
  // when the filter/search signature changes, snap the window back to `step`.
  if (resetKey !== lastKey) {
    setLastKey(resetKey)
    setVisible(step)
  }

  // Never report more than we have (guards against shrinking lists).
  const cappedVisible = Math.min(visible, total)
  const canLoadMore = cappedVisible < total

  const loadMore = () => setVisible((current) => current + step)

  return { visible: cappedVisible, canLoadMore, loadMore, total }
}

export default useVisibleCount
