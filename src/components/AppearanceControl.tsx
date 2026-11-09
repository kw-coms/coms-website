import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, ChevronUp, Compass, Moon, Sun, X } from 'lucide-react'
import { accentSwatches, footerLinkGroups } from '../data/homeContent'
import { DEFAULT_ACCENT, normalizeHex } from '../utils/themeColors'
import { startSiteTour } from './tour/tourState'
import { setPerfPreference, usePerfState, type PerfPreference } from '../utils/perfMode'

const PERF_CHOICES: { value: PerfPreference; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'lite', label: '가볍게' },
  { value: 'full', label: '화려하게' },
]

const SHEET_QUERY = '(max-width: 639px)'
const subscribeSheet = (notify: () => void) => {
  const mq = window.matchMedia(SHEET_QUERY)
  mq.addEventListener('change', notify)
  return () => mq.removeEventListener('change', notify)
}
const isSheet = () => window.matchMedia(SHEET_QUERY).matches

export const OPEN_APPEARANCE_EVENT = 'coms:open-appearance'

export default function AppearanceControl({
  accentColor,
  setAccentColor,
  themeMode,
  setThemeMode,
  activeFonts = [],
  selectedFontId = null,
  onFontChange,
  fontSelectionLocked = false,
  onOpenAccountSettings,
}: {
  accentColor?: string
  setAccentColor: (value: string) => void
  themeMode?: string
  setThemeMode: (value: string) => void
  activeFonts?: { id: string | number; name: string }[]
  selectedFontId?: string | number | null
  onFontChange?: (value: string) => void
  fontSelectionLocked?: boolean
  onOpenAccountSettings?: () => void
}) {
  const accent = normalizeHex(accentColor)
  const isDark = themeMode === 'dark'
  const fontSelectValue = selectedFontId ? String(selectedFontId) : ''
  const perf = usePerfState()
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  const dialogId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusPerfRef = useRef(false)
  const sheet = useSyncExternalStore(subscribeSheet, isSheet, () => false)
  const { pathname } = useLocation()
  // The footer outlives route changes: remembering the page it was opened on closes it when the page changes.
  const [openAt, setOpenAt] = useState<string | null>(null)
  // Derived-state reset during render: coming back to the page it was opened on must not reopen it.
  if (openAt !== null && openAt !== pathname) setOpenAt(null)
  const open = openAt === pathname
  const focusFrameRef = useRef(0)
  const setOpen = useCallback((value: boolean) => setOpenAt(value ? pathname : null), [pathname])

  const close = useCallback((returnFocus: boolean) => {
    focusPerfRef.current = false
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [setOpen])

  useEffect(() => () => window.cancelAnimationFrame(focusFrameRef.current), [])

  // Lets the "settings" button of the low-power notice open the panel from anywhere on the page.
  useEffect(() => {
    const openFromOutside = () => { focusPerfRef.current = true; setOpen(true) }
    window.addEventListener(OPEN_APPEARANCE_EVENT, openFromOutside)
    return () => window.removeEventListener(OPEN_APPEARANCE_EVENT, openFromOutside)
  }, [setOpen])

  useEffect(() => {
    if (!open) return undefined
    const dialog = dialogRef.current
    if (focusPerfRef.current) {
      focusPerfRef.current = false
      dialog?.querySelector<HTMLElement>('[data-perf-choice][tabindex="0"]')?.focus()
    } else {
      dialog?.focus()
    }
    // On desktop the popover opens upward from the footer: keep it below the fixed header, inside the viewport.
    const fit = () => {
      const top = buttonRef.current?.getBoundingClientRect().top ?? 0
      const headerBottom = document.querySelector('.apple-global-nav')?.getBoundingClientRect().bottom ?? 0
      setMaxHeight(Math.max(160, Math.floor(top - Math.max(headerBottom, 0) - 16)))
    }
    fit()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      // The bottom sheet covers the page, so Tab stays inside it. The desktop popover lets Tab leave.
      if (event.key !== 'Tab' || !isSheet() || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')].filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (dialog?.contains(target) || buttonRef.current?.contains(target)) return
      const onBackdrop = Boolean((target as Element).closest?.('.appearance-backdrop'))
      const returnFocus = onBackdrop || Boolean(dialog?.contains(document.activeElement))
      close(false)
      // The press then focuses whatever was clicked; only when focus falls back to <body> does it go back to the button.
      if (returnFocus) {
        focusFrameRef.current = window.requestAnimationFrame(() => {
          const active = document.activeElement
          if (!active || active === document.body) buttonRef.current?.focus()
        })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', fit)
    }
  }, [open, close])

  const groupLabel = 'text-xs font-semibold text-[var(--app-text)]'
  const chip = 'inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9'
  const segment = 'inline-flex items-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] p-1'
  const segmentOn = 'bg-[var(--app-text)] text-[var(--app-surface)]'
  const segmentOff = 'text-[var(--app-muted)] hover:text-[var(--app-text)]'

  return (
    <footer className="appearance-control apple-footer-surface border-t border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-5 pb-6 pt-6 text-[var(--app-muted)]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="appearance-panel flex flex-col gap-4 border-b border-[var(--app-hairline)] pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="apple-footer-note min-w-0 max-w-xl text-xs leading-5">
            <p>KW COM&apos;s는 광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리입니다.</p>
            <p className="mt-1">활동 안내와 모집 일정은 공지사항을 통해 순차적으로 공개됩니다.</p>
          </div>

          <div className="appearance-actions relative flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
              className="appearance-mode-toggle inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:size-9"
              aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
              title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={startSiteTour}
              className="appearance-tour-trigger inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9 sm:flex-none"
            >
              <Compass size={14} aria-hidden="true" />
              튜토리얼 시작
            </button>
            <button
              ref={buttonRef}
              type="button"
              data-tour="appearance"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls={dialogId}
              aria-haspopup="dialog"
              className="appearance-trigger inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9 sm:flex-none"
            >
              <span className="size-3.5 rounded-full border border-[var(--app-hairline-strong)]" style={{ backgroundColor: accent }} aria-hidden="true" />
              화면 설정
              <ChevronUp size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <>
                <div className="appearance-backdrop" aria-hidden="true" />
                <div
                  ref={dialogRef}
                  id={dialogId}
                  role="dialog"
                  aria-label="화면 설정"
                  aria-modal={sheet ? true : undefined}
                  tabIndex={-1}
                  className="appearance-popover text-[var(--app-text)] focus:outline-none"
                  style={maxHeight ? { '--appearance-max-h': `${maxHeight}px` } as React.CSSProperties : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">화면 설정</h2>
                    <button
                      type="button"
                      onClick={() => close(true)}
                      className="grid size-11 place-items-center rounded-full text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:size-8"
                      aria-label="화면 설정 닫기"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 divide-y divide-[var(--app-hairline)]">
                    <div role="group" aria-labelledby={`${dialogId}-mode`} className="flex flex-wrap items-center justify-between gap-2 pb-3">
                      <span id={`${dialogId}-mode`} className={groupLabel}>테마</span>
                      <div className={segment}>
                        {[{ value: 'light', label: '라이트', Icon: Sun }, { value: 'dark', label: '다크', Icon: Moon }].map(({ value, label, Icon }) => {
                          const active = (value === 'dark') === isDark
                          return (
                            <button key={value} type="button" aria-pressed={active} onClick={() => setThemeMode(value)} className={`${chip} gap-1.5 ${active ? segmentOn : segmentOff}`}>
                              <Icon size={13} aria-hidden="true" />
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span id="perf-choice-label" className={groupLabel}>화면 효과</span>
                        <div
                          role="radiogroup"
                          aria-labelledby="perf-choice-label"
                          className={segment}
                          onKeyDown={(event) => {
                            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
                            if (!step) return
                            event.preventDefault()
                            const index = PERF_CHOICES.findIndex((choice) => choice.value === perf.preference)
                            const next = PERF_CHOICES[(index + step + PERF_CHOICES.length) % PERF_CHOICES.length]
                            setPerfPreference(next.value)
                            event.currentTarget.querySelector<HTMLElement>(`[data-perf-choice="${next.value}"]`)?.focus()
                          }}
                        >
                          {PERF_CHOICES.map((choice) => {
                            const active = perf.preference === choice.value
                            return (
                              <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                tabIndex={active ? 0 : -1}
                                data-perf-choice={choice.value}
                                onClick={() => setPerfPreference(choice.value)}
                                className={`${chip} ${active ? segmentOn : segmentOff}`}
                              >
                                {choice.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {perf.preference === 'auto' && (
                        <p className="mt-1.5 text-[11px] text-[var(--app-subtle)]">{perf.mode === 'lite' ? '지금은 가벼운 화면' : '지금은 화려한 화면'}</p>
                      )}
                    </div>

                    {activeFonts.length > 0 && (
                      <div className="appearance-font-row py-3" role="group" aria-label="폰트 설정">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={groupLabel}>폰트</span>
                          <span className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-muted)]">
                            {fontSelectionLocked ? '내 계정에 저장됨' : '이 브라우저에 임시 적용'}
                          </span>
                        </div>
                        {fontSelectionLocked ? (
                          <button
                            type="button"
                            onClick={() => { close(false); onOpenAccountSettings?.() }}
                            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9"
                          >
                            계정 설정에서 폰트 변경
                          </button>
                        ) : (
                          <select
                            value={fontSelectValue}
                            onChange={(event) => onFontChange?.(event.target.value)}
                            className="mt-2 min-h-11 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9"
                            aria-label="사이트 폰트 선택"
                          >
                            <option value="">기본 폰트</option>
                            {activeFonts.map((font) => (
                              <option key={font.id} value={font.id}>{font.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    <div role="group" aria-labelledby={`${dialogId}-color`} className="appearance-color-row pt-3">
                      <span id={`${dialogId}-color`} className={groupLabel}>강조 색상</span>
                      <div className="appearance-swatches mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                        {accentSwatches.map((swatch) => {
                          const active = accent === swatch.value
                          return (
                            <button
                              key={swatch.value}
                              type="button"
                              onClick={() => setAccentColor(swatch.value)}
                              className={`relative grid size-11 min-h-11 min-w-11 place-items-center rounded-full border border-[var(--app-hairline-strong)] transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface-elevated)] sm:size-8 sm:min-h-8 sm:min-w-8 ${active ? 'ring-2 ring-[var(--app-text)] ring-offset-2 ring-offset-[var(--app-surface-elevated)]' : ''}`}
                              style={{ backgroundColor: swatch.value }}
                              aria-label={`${swatch.name} 색상 선택`}
                              aria-pressed={active}
                              title={swatch.name}
                            >
                              {active && <Check size={14} strokeWidth={3} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </div>
                      <div className="appearance-color-actions mt-3 flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] focus-within:ring-2 focus-within:ring-[var(--app-accent)]/40 sm:min-h-9">
                          직접 선택
                          <span className="relative grid size-5 overflow-hidden rounded-full border border-[var(--app-hairline)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" style={{ backgroundColor: accent }}>
                            <input
                              type="color"
                              value={accent}
                              onChange={(event) => setAccentColor(event.target.value)}
                              className="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
                              aria-label="커스텀 색상 선택"
                            />
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setAccentColor(DEFAULT_ACCENT)}
                          className="min-h-11 rounded-full border border-[var(--app-hairline)] bg-transparent px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 sm:min-h-9"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="apple-footer-directory grid grid-cols-3 gap-x-4 gap-y-4 border-b border-[var(--app-hairline)] py-4 text-xs sm:gap-x-10">
          {footerLinkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-[var(--app-text)]">{group.title}</h3>
              <ul className="mt-1">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noreferrer' : undefined}
                      className="coms-footer-link text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="apple-footer-bottom flex flex-col gap-1 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {new Date().getFullYear()} KW COM&apos;s. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4">
            <a href="/notices" className="coms-footer-link hover:text-[var(--app-text)]">Notices</a>
            <a href="/community" className="coms-footer-link hover:text-[var(--app-text)]">Community</a>
            <a href="mailto:kwcoms69@gmail.com" className="coms-footer-link hover:text-[var(--app-text)]">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
