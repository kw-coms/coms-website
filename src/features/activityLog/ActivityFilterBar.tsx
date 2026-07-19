function ActivityFilterBar({
  categories,
  searchText,
  setSearchText,
  categoryFilter,
  setCategoryFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  hasActiveFilters,
  onResetFilters,
}) {
  return (
    <div className="activity-log-filters mt-8 flex flex-wrap items-end gap-3">
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
        <span>검색</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="제목, 내용, 작성자로 검색"
          className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
        <span>분류</span>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
        >
          <option value="ALL">전체 분류</option>
          {categories.map((category) => (
            <option key={category.key} value={category.key}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
        <span>시작일</span>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
        <span>종료일</span>
        <input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
        />
      </label>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-soft)]"
        >
          필터 초기화
        </button>
      )}
    </div>
  )
}

export default ActivityFilterBar
