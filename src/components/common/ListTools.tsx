import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import type { SortDirection } from '../../utils/listTools'

/**
 * Controls for searching and ordering a list that is already on the page (the admin lists).
 * They hold no state: the screen owns the query and the order, utils/listTools does the work.
 */

const fieldClass =
  'min-h-10 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30'

export function ListSearch({ value, onChange, placeholder, label }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div className="relative min-w-0 flex-1 basis-56">
      <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--app-subtle)]" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${fieldClass} w-full py-2 pl-9 pr-4 placeholder:text-[var(--app-subtle)]`}
      />
    </div>
  )
}

export function ListSelect({ value, onChange, options, label }: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  label: string
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={`${fieldClass} px-3 py-2 font-semibold`}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

/** Flips ascending and descending. Disabled while the list is in its original order. */
export function SortDirectionButton({ direction, onChange, disabled = false }: {
  direction: SortDirection
  onChange: (direction: SortDirection) => void
  disabled?: boolean
}) {
  const ascending = direction === 'asc'
  return (
    <button
      type="button"
      onClick={() => onChange(ascending ? 'desc' : 'asc')}
      disabled={disabled}
      aria-label={ascending ? '오름차순 정렬 중, 내림차순으로 바꾸기' : '내림차순 정렬 중, 오름차순으로 바꾸기'}
      title={ascending ? '오름차순' : '내림차순'}
      className={`${fieldClass} inline-flex items-center gap-1.5 px-3 py-2 font-semibold transition hover:bg-[var(--app-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {ascending ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
      {ascending ? '오름차순' : '내림차순'}
    </button>
  )
}

/** "36명" when everything is shown, "36명 중 5명" when the list is narrowed. Announced politely. */
export function ListCount({ shown, total, unit = '명' }: { shown: number; total: number; unit?: string }) {
  return (
    <span role="status" className="shrink-0 text-xs font-semibold text-[var(--app-muted)]">
      {shown === total ? `${total}${unit}` : `${total}${unit} 중 ${shown}${unit}`}
    </span>
  )
}

/** A column heading that orders the table: unsorted, ascending, descending, unsorted. */
export function SortableTh({ label, active, direction, onSort, className = '' }: {
  label: string
  active: boolean
  direction: SortDirection
  onSort: () => void
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={className} aria-sort={!active ? 'none' : direction === 'asc' ? 'ascending' : 'descending'}>
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold transition hover:text-[var(--app-text)] ${active ? 'text-[var(--app-accent-text)]' : ''}`}
      >
        {label}
        <Icon size={12} aria-hidden="true" className={active ? '' : 'opacity-50'} />
      </button>
    </th>
  )
}
