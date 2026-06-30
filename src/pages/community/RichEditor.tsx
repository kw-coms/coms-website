import { lazy, Suspense } from 'react'

type EditorBlock = { type?: string; options?: unknown[]; [key: string]: unknown }

const TiptapTextEditor = lazy(() => import('./TiptapTextEditor'))

export default function RichEditor(props: {
  initialBlocks: EditorBlock[]
  apiRef?: { current: unknown } | null
  onError?: (message: string) => void
}) {
  return (
    <Suspense fallback={<div className="min-h-[420px] w-full bg-[var(--app-surface)] px-4 py-5 text-sm text-[var(--theme-body-muted)] sm:px-5" />}>
      <TiptapTextEditor {...props} />
    </Suspense>
  )
}
