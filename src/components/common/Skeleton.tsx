import type { CSSProperties, ReactNode } from 'react'

type SkeletonProps = {
  variant?: 'block' | 'line' | 'circle'
  className?: string
  style?: CSSProperties
}

/**
 * Shimmering placeholder primitive. Reuses the shared `.skeleton` shimmer
 * (styles/home-interactions.css) and the reduced-motion override already
 * defined for it (styles/polish-misc.css) — pass Tailwind sizing utilities
 * (w-*, h-*, rounded-*) via `className` the same way existing hand-rolled
 * skeletons already do.
 */
export function Skeleton({ variant = 'block', className = '', style }: SkeletonProps) {
  const variantClass = variant === 'line' ? 'skeleton-line' : variant === 'circle' ? 'skeleton-circle' : ''
  return <div className={['skeleton', variantClass, className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />
}

/** Convenience alias for a single text-line skeleton. */
export function SkeletonLine({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <Skeleton variant="line" className={className} style={style} />
}

/** Wraps a group of skeleton rows with a single assistive-tech loading announcement. */
export function SkeletonGroup({ children, label = '불러오는 중' }: { children: ReactNode; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {children}
    </div>
  )
}

export default Skeleton
