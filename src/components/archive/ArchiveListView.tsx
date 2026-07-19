import { Download, RefreshCw, Search } from 'lucide-react'
import { downloadUrl } from '../../services/archiveApi'
import { richBodyToPlainText } from '../richEditor/renderRichBody'
import { CategorySegment } from './CategorySegment'
import { ARCHIVE_CATEGORIES, categoryLabel, clickableCell, formatDate, formatSize, openRowWithKeyboard } from './archiveUtils'

export function ArchiveListView({
  activeCategory,
  onCategoryChange,
  categoryCounts,
  searchQuery,
  onSearchChange,
  filteredFiles,
  notice,
  error,
  onReload,
  loading,
  visibleFiles,
  total,
  canLoadMore,
  loadMore,
  onOpenFile,
}: {
  activeCategory: string
  onCategoryChange: (value: string) => void
  categoryCounts: Record<string, number>
  searchQuery: string
  onSearchChange: (value: string) => void
  filteredFiles: unknown[]
  notice: string
  error: string
  onReload: () => void
  loading: boolean
  visibleFiles: any[]
  total: number
  canLoadMore: boolean
  loadMore: () => void
  onOpenFile: (file: any) => void
}) {
  return (
    <>
      <div className="apple-control-strip flex flex-col gap-3 px-4 py-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <CategorySegment
          value={activeCategory}
          onChange={onCategoryChange}
          items={ARCHIVE_CATEGORIES}
          counts={categoryCounts}
        />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex min-w-0 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-[var(--app-subtle)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="세미나, 프로젝트, 작성자 검색"
              className="h-11 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-8 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none transition focus:ring-2 focus:ring-[#0071e3]/24 sm:h-10 sm:w-64"
            />
          </div>
          <div className="text-xs font-bold text-[var(--app-subtle)]">{filteredFiles.length}개</div>
        </div>
      </div>

      {notice && (
        <div className="mx-5 mt-5 rounded-lg border border-[#0071e3]/20 bg-[#e8f3ff] px-4 py-3 text-sm font-bold text-[#0066cc] sm:mx-7">
          {notice}
        </div>
      )}

      {error && (
        <div className="mx-5 mt-5 flex flex-col gap-3 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mx-7 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onReload}
            className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm"
          >
            <RefreshCw size={15} />
            다시 시도
          </button>
        </div>
      )}

      <div className="m-4 overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:m-7">
        {loading ? (
          <>
            {/* Mobile skeleton cards */}
            <div className="grid gap-3 p-4 md:hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="apple-soft-panel p-4">
                  <span className="flex items-center gap-2">
                    <div className="skeleton h-6 w-20 rounded-full" />
                    <div className="skeleton ml-auto h-4 w-10 rounded" />
                  </span>
                  <div className="skeleton skeleton-line mt-3 w-4/5" />
                  <div className="skeleton skeleton-line mt-1 w-2/3" />
                  <div className="skeleton skeleton-line mt-3 w-1/2" />
                  <div className="mt-4 flex justify-end border-t border-[var(--app-hairline)] pt-3">
                    <div className="skeleton h-10 w-28 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop skeleton table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="apple-table w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[var(--app-hairline)]">
                  <tr>
                    <th className="w-16 px-4 py-3">번호</th>
                    <th className="w-28 px-4 py-3">카테고리</th>
                    <th className="px-4 py-3">제목</th>
                    <th className="w-28 px-4 py-3">크기</th>
                    <th className="w-28 px-4 py-3">작성자</th>
                    <th className="w-36 px-4 py-3">날짜</th>
                    <th className="w-28 px-4 py-3 text-right">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-hairline)]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-4"><div className="skeleton h-4 w-8 rounded" /></td>
                      <td className="px-4 py-4"><div className="skeleton h-6 w-20 rounded-full" /></td>
                      <td className="px-4 py-4">
                        <div className="skeleton h-4 w-56 rounded" />
                        <div className="skeleton mt-1 h-3 w-36 rounded" />
                      </td>
                      <td className="px-4 py-4"><div className="skeleton h-4 w-14 rounded" /></td>
                      <td className="px-4 py-4"><div className="skeleton h-4 w-16 rounded" /></td>
                      <td className="px-4 py-4">
                        <div className="skeleton h-4 w-24 rounded" />
                        <div className="skeleton mt-1 h-3 w-20 rounded" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="skeleton ml-auto h-9 w-24 rounded-full" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : filteredFiles.length === 0 ? (
          <div className="flex min-h-[12rem] items-center justify-center px-5 py-12 text-center text-sm font-medium text-[var(--app-muted)] sm:min-h-[14rem]">
            {searchQuery ? '검색 결과가 없습니다.' : '등록된 자료가 없습니다.'}
          </div>
        ) : (
          <>
          <div className="grid gap-3 p-4 md:hidden">
            {visibleFiles.map((file, index) => {
              const open = () => onOpenFile(file)
              return (
                <article key={file.id} className="apple-soft-panel p-4" data-reveal style={{ '--reveal-delay': `${Math.min(index, 6) * 55}ms` } as React.CSSProperties}>
                  <button
                    type="button"
                    onClick={open}
                    className="block w-full text-left focus:outline-none focus:bg-[var(--app-surface-soft)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-accent-text)]">
                        {categoryLabel(file.category || 'GENERAL')}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] font-bold text-[var(--app-subtle)]">{formatSize(file.fileSize)}</span>
                    </span>
                    <span className="mt-3 block line-clamp-2 text-[15px] font-bold leading-6 text-[var(--app-text)]" title={file.title || file.originalName}>
                      {file.title || file.originalName}
                    </span>
                    {richBodyToPlainText(file.description) && (
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">
                        {richBodyToPlainText(file.description)}
                      </span>
                    )}
                    <span className="mt-3 block truncate text-xs font-semibold text-[var(--app-subtle)]">
                      {file.uploaderName || file.uploadedBy || '-'} · {formatDate(file.uploadedAt)} · 조회 {file.viewCount ?? 0} · 개추 {file.upvotes ?? 0}
                    </span>
                  </button>
                  <div className="mt-3.5 flex justify-end border-t border-[var(--app-hairline)] pt-3.5">
                    <a
                      href={downloadUrl(file.id)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 text-sm font-bold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-elevated)]"
                    >
                      <Download size={15} />
                      다운로드
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="apple-table w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--app-hairline)]">
                <tr>
                  <th className="w-16 px-4 py-3">번호</th>
                  <th className="w-28 px-4 py-3">카테고리</th>
                  <th className="px-4 py-3">제목</th>
                  <th className="w-28 px-4 py-3">크기</th>
                  <th className="w-28 px-4 py-3">작성자</th>
                  <th className="w-36 px-4 py-3">날짜</th>
                  <th className="w-28 px-4 py-3 text-right">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-hairline)]">
                {visibleFiles.map((file, index) => {
                  const open = () => onOpenFile(file)
                  return (
                    <tr
                      key={file.id}
                      tabIndex={0}
                      role="button"
                      onClick={open}
                      onKeyDown={(event) => openRowWithKeyboard(event, open)}
                      className="cursor-pointer text-[var(--app-muted)] focus:outline-none focus:bg-[var(--app-surface-soft)]"
                      data-reveal
                      style={{ '--reveal-delay': `${Math.min(index, 6) * 55}ms` } as React.CSSProperties}
                    >
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-[var(--app-subtle)]">{file.id}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                        <span className="inline-flex rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)]">
                          {categoryLabel(file.category || 'GENERAL')}
                        </span>
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                        <span className="block max-w-[340px] truncate font-bold text-[var(--app-text)]" title={file.title || file.originalName}>
                          {file.title || file.originalName}
                        </span>
                        {richBodyToPlainText(file.description) && (
                          <span className="mt-0.5 block max-w-[340px] truncate text-xs text-[var(--app-subtle)]">
                            {richBodyToPlainText(file.description)}
                          </span>
                        )}
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{formatSize(file.fileSize)}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{file.uploaderName || file.uploadedBy || '-'}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                        <span className="block">{formatDate(file.uploadedAt)}</span>
                        <span className="mt-0.5 block text-xs text-[var(--app-subtle)]">조회 {file.viewCount ?? 0} · 개추 {file.upvotes ?? 0}</span>
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={downloadUrl(file.id)}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 font-bold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-elevated)]"
                          >
                            <Download size={15} />
                            다운로드
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col items-center gap-2 border-t border-[var(--app-hairline)] px-4 py-5">
            <span className="text-xs font-bold text-[var(--app-subtle)]">
              전체 {total}개 중 {visibleFiles.length}개 표시
            </span>
            {canLoadMore && (
              <button
                type="button"
                onClick={loadMore}
                className="apple-action-secondary inline-flex min-h-11 items-center justify-center px-6 text-sm sm:min-h-10"
              >
                더 보기
              </button>
            )}
          </div>
          </>
        )}
      </div>
    </>
  )
}
