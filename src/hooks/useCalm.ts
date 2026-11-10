import { useEffect, useState } from 'react'
import { usePerfState } from '../utils/perfMode'

/** True under reduced motion or in lite mode: the page rests in its finished, still state. */
export function useCalm() {
  const lite = usePerfState().mode === 'lite'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return lite || reduced
}
