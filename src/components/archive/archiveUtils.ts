import { ArchiveCategory } from '../../contract/enums'
import { enumLabels } from '../../contract/labels'

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

export function clickableCell(open) {
  return { onClick: open }
}

// Labels keyed by the canonical ArchiveFile.Category enum (drift-guarded);
// 'ALL' is a UI-only pseudo-category, not part of the contract.
export const ARCHIVE_CATEGORY_LABELS = enumLabels(ArchiveCategory, {
  [ArchiveCategory.GENERAL]: '일반 자료',
  [ArchiveCategory.ACADEMIC_JOURNAL]: '학술회지',
})

export const ARCHIVE_CATEGORIES = [
  { value: 'ALL', label: '전체' },
  { value: ArchiveCategory.GENERAL, label: ARCHIVE_CATEGORY_LABELS[ArchiveCategory.GENERAL] },
  { value: ArchiveCategory.ACADEMIC_JOURNAL, label: ARCHIVE_CATEGORY_LABELS[ArchiveCategory.ACADEMIC_JOURNAL] },
]

export const WRITABLE_ARCHIVE_CATEGORIES = ARCHIVE_CATEGORIES.filter((item) => item.value !== 'ALL')

export function categoryLabel(value) {
  return ARCHIVE_CATEGORIES.find((item) => item.value === value)?.label || '일반 자료'
}
