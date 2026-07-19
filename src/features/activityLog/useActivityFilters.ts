import { useState } from 'react'
import { richTextToPlainText } from '../../shared/homeUi'

// Search + filter state (mirrors notices/resources/community list patterns).
export function useActivityFilters(allActivityItems, compact) {
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const normalizedSearch = searchText.trim().toLowerCase()
  const filteredItems = allActivityItems.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false
    if (fromDate && (item.eventDate || '') < fromDate) return false
    if (toDate && (item.eventDate || '') > toDate) return false
    if (normalizedSearch) {
      const haystack = `${item.title || ''} ${richTextToPlainText(item.description) || ''} ${item.createdByName || ''}`.toLowerCase()
      if (!haystack.includes(normalizedSearch)) return false
    }
    return true
  })
  const visibleItems = compact ? filteredItems.slice(0, 3) : filteredItems
  const hasActiveFilters = Boolean(normalizedSearch) || categoryFilter !== 'ALL' || Boolean(fromDate) || Boolean(toDate)

  return {
    searchText,
    setSearchText,
    categoryFilter,
    setCategoryFilter,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    filteredItems,
    visibleItems,
    hasActiveFilters,
  }
}
