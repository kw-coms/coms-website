import { useState } from 'react'
import { groupVisibleTabs, type AdminGroupId } from './adminTabs'

type Tab = { id: string; label: string; group: AdminGroupId | null }

/**
 * Side menu on a desktop; on a phone a row of the headings and then the chosen heading's tabs.
 * One set of tabs in the page: the phone only hides the other headings' tabs.
 */
export default function AdminTabNav({ visibleTabs, activeId, onSelect }: {
  visibleTabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const groups = groupVisibleTabs(visibleTabs)
  const overview = visibleTabs.find((tab) => tab.group === null)
  const activeGroup = visibleTabs.find((tab) => tab.id === activeId)?.group ?? null
  // A heading picked on a phone holds only until the active tab changes.
  const [picked, setPicked] = useState<{ group: AdminGroupId; forTab: string } | null>(null)
  const shownGroup = (picked && picked.forTab === activeId ? picked.group : activeGroup) ?? groups[0]?.id

  const tabClass = (id: string) => `shape-cut-sm flex min-h-11 items-center px-4 py-2 text-left text-sm font-semibold transition lg:min-h-10 ${
    activeId === id
      ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
      : 'border border-[var(--app-hairline)] bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
  }`

  const renderTab = (tab: Tab) => (
    <button
      id={`admin-tab-${tab.id}`}
      key={tab.id}
      type="button"
      role="tab"
      aria-selected={activeId === tab.id}
      aria-controls={`admin-panel-${tab.id}`}
      onClick={() => onSelect(tab.id)}
      className={tabClass(tab.id)}
    >
      {tab.label}
    </button>
  )

  return (
    <nav aria-label="운영 패널 메뉴" data-testid="admin-nav" className="space-y-3 lg:sticky lg:top-24 lg:self-start">
      {overview && <div role="tablist" aria-label="요약" className="flex flex-col">{renderTab(overview)}</div>}

      <div role="group" aria-label="운영 메뉴 분류" className="flex flex-wrap gap-2 lg:hidden">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={shownGroup === group.id}
            onClick={() => setPicked({ group: group.id, forTab: activeId })}
            className={`shape-cut-sm min-h-11 px-4 text-sm font-semibold transition ${
              shownGroup === group.id
                ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                : 'border border-[var(--app-hairline)] bg-white/60 text-[var(--theme-body-dark)]'
            }`}
          >
            {group.label}
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <div key={group.id} className={shownGroup === group.id ? 'block' : 'hidden lg:block'}>
          <p aria-hidden="true" className="mb-2 hidden text-xs font-bold uppercase tracking-[0.2em] text-[var(--theme-body-muted)] lg:block">{group.label}</p>
          <div role="tablist" aria-label={group.label} className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
            {group.tabs.map(renderTab)}
          </div>
        </div>
      ))}
    </nav>
  )
}
