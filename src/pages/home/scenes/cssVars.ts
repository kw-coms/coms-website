import type { CSSProperties } from 'react'

/** Custom properties for a style prop (--i, --n, ...). */
export const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties
