import { useEffect, useRef, type ReactNode } from 'react'
import { highlightCodeIn } from './highlightCode'

/**
 * Wraps a rendered post body and lazily syntax-highlights any `<pre><code>`
 * blocks after mount / content change. Lives in its own file so PostBlocks.tsx
 * keeps exporting only its render helper (react-refresh/only-export-components).
 */
export function PostBlocksContent({ contentKey, children }: { contentKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void highlightCodeIn(ref.current)
  }, [contentKey])
  return (
    <div ref={ref} className="px-4 py-5 sm:px-5">
      {children}
    </div>
  )
}
