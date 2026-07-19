export function CategorySegment({ value, onChange, items, counts }: {
  value: string
  onChange: (value: string) => void
  items: { value: string; label: string }[]
  counts?: Record<string, number>
}) {
  return (
    <div className="flex w-full max-w-full items-center gap-1 overflow-x-auto touch-pan-x rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] sm:inline-flex sm:w-auto">
      {items.map((item) => {
        const selected = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.value)}
            className={`inline-flex min-h-10 min-w-0 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition sm:min-h-8 sm:flex-none sm:px-3.5 sm:text-xs ${selected ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'}`}
          >
            <span className="whitespace-nowrap">{item.label}</span>
            {counts && (
              <span className={selected ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-subtle)]'}>
                {counts[item.value] || 0}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
