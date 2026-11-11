import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronUp, Compass, Moon, Sun, X } from 'lucide-react'
import { accentSwatches, navGroups } from '../data/homeContent'
import { DEFAULT_ACCENT, normalizeHex, scrollToTopInstant, type IntroStyle, type AccentStrength } from '../utils/themeColors'
import { isFullPageLink } from '../utils/fullPageLink'
import { useAuth } from '../contexts/useAuth'
import MemberLock from './MemberLock'
import { startSiteTour } from './tour/tourState'
import { setPerfPreference, usePerfState, type PerfPreference } from '../utils/perfMode'

const PERF_CHOICES: { value: PerfPreference; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'lite', label: '가볍게' },
  { value: 'full', label: '화려하게' },
]
const INTRO_CHOICES: { value: IntroStyle; label: string }[] = [
  { value: 'cinematic', label: '현재 인트로' },
  { value: 'legacy', label: '예전 인트로' },
  { value: 'off', label: '끄기' },
]
const ACCENT_CHOICES: { value: AccentStrength; label: string }[] = [
  { value: 'standard', label: '기본' },
  { value: 'vivid', label: '선명하게' },
]

const SHEET_QUERY = '(max-width: 639px)'
const subscribeSheet = (notify: () => void) => {
  const mq = window.matchMedia(SHEET_QUERY)
  mq.addEventListener('change', notify)
  return () => mq.removeEventListener('change', notify)
}
const isSheet = () => window.matchMedia(SHEET_QUERY).matches
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const subscribeReduced = (notify: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', notify)
  return () => mq.removeEventListener('change', notify)
}
const isReduced = () => window.matchMedia(REDUCED_QUERY).matches

export const OPEN_APPEARANCE_EVENT = 'coms:open-appearance'

export default function AppearanceControl({
  accentColor,
  setAccentColor,
  themeMode,
  setThemeMode,
  introStyle = 'cinematic',
  setIntroStyle,
  onPreviewIntro,
  accentStrength = 'standard',
  setAccentStrength,
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
  introStyle?: IntroStyle
  setIntroStyle: (value: IntroStyle) => void
  onPreviewIntro: () => void
  accentStrength?: AccentStrength
  setAccentStrength: (value: AccentStrength) => void
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
  const { loading: authLoading } = useAuth()
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  const dialogId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusPerfRef = useRef(false)
  const sheet = useSyncExternalStore(subscribeSheet, isSheet, () => false)
  const reducedMotion = useSyncExternalStore(subscribeReduced, isReduced, () => false)
  const cannotPreview = introStyle === 'off' || perf.mode === 'lite' || reducedMotion
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
  const segmentOn = 'appearance-choice-active'
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
                        <span id={`${dialogId}-intro`} className={groupLabel}>인트로</span>
                        <div
                          role="radiogroup"
                          aria-labelledby={`${dialogId}-intro`}
                          className={segment}
                          onKeyDown={(event) => {
                            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
                            if (!step) return
                            event.preventDefault()
                            const index = INTRO_CHOICES.findIndex((choice) => choice.value === introStyle)
                            const next = INTRO_CHOICES[(index + step + INTRO_CHOICES.length) % INTRO_CHOICES.length]
                            setIntroStyle(next.value)
                            event.currentTarget.querySelector<HTMLElement>(`[data-intro-choice="${next.value}"]`)?.focus()
                          }}
                        >
                          {INTRO_CHOICES.map((choice) => {
                            const active = introStyle === choice.value
                            return (
                              <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                tabIndex={active ? 0 : -1}
                                data-intro-choice={choice.value}
                                onClick={() => setIntroStyle(choice.value)}
                                className={`${chip} ${active ? segmentOn : segmentOff}`}
                              >
                                {choice.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-[var(--app-muted)]">
                        {introStyle === 'legacy' ? '예전 인트로: 지구에서 한반도와 광운대를 거쳐 COM’S 로고로 이어집니다.' : introStyle === 'off' ? '홈 화면으로 바로 들어갑니다.' : '새 탭에서 홈을 열면 지금의 짧은 인트로가 나옵니다.'}
                      </p>
                      <button
                        type="button"
                        aria-label="선택한 인트로 보기"
                        disabled={cannotPreview}
                        onClick={() => { close(true); onPreviewIntro() }}
                        className="mt-2 min-h-11 rounded-full border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:border-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
                      >
                        선택한 인트로 보기
                      </button>
                      {cannotPreview && (
                        <p className="mt-1.5 text-[11px] leading-4 text-[var(--app-muted)]">{introStyle === 'off' ? '인트로를 켜면 미리 볼 수 있어요.' : reducedMotion ? '동작 줄이기 설정에서는 인트로를 재생하지 않아요.' : '가벼운 화면에서는 인트로를 재생하지 않아요.'}</p>
                      )}
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
                      <p className="mt-1.5 text-[11px] leading-4 text-[var(--app-muted)]">자동은 기기에 맞추고, 가볍게는 배경 움직임과 흐림을 줄여요. 화려하게는 전체 효과를 보여줘요.</p>
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
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span id={`${dialogId}-strength`} className="text-[11px] text-[var(--app-muted)]">강조 정도</span>
                        <div
                          role="radiogroup"
                          aria-labelledby={`${dialogId}-strength`}
                          className={segment}
                          onKeyDown={(event) => {
                            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
                            if (!step) return
                            event.preventDefault()
                            const index = ACCENT_CHOICES.findIndex((choice) => choice.value === accentStrength)
                            const next = ACCENT_CHOICES[(index + step + ACCENT_CHOICES.length) % ACCENT_CHOICES.length]
                            setAccentStrength(next.value)
                            event.currentTarget.querySelector<HTMLElement>(`[data-accent-strength-choice="${next.value}"]`)?.focus()
                          }}
                        >
                          {ACCENT_CHOICES.map((choice) => {
                            const active = accentStrength === choice.value
                            return (
                              <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                tabIndex={active ? 0 : -1}
                                data-accent-strength-choice={choice.value}
                                onClick={() => setAccentStrength(choice.value)}
                                className={`${chip} ${active ? segmentOn : segmentOff}`}
                              >
                                {choice.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="appearance-accent-preview mt-2 flex items-center gap-2 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-[11px] text-[var(--app-muted)]">
                        <span className="rounded-full border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] px-2.5 py-1 font-semibold text-[var(--app-text)]">선택한 메뉴</span>
                        <span>현재 강조색</span>
                      </div>
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

        <nav aria-label="사이트맵" className="apple-footer-directory grid grid-cols-2 gap-x-4 gap-y-8 border-b border-[var(--app-hairline)] py-8 text-sm sm:grid-cols-4 sm:gap-x-10">
          {navGroups.map((group) => (
            <div key={group.id}>
              <h3 className="font-semibold text-[var(--app-text)]">{group.label}</h3>
              <ul className="mt-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {isFullPageLink(item.path) ? (
                      <a href={item.path} className="coms-footer-link gap-1.5 rounded-sm text-[var(--app-muted)] hover:text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]">{item.label}</a>
                    ) : (
                    <Link
                      to={item.path}
                      aria-disabled={item.auth && authLoading || undefined}
                      onClick={(event) => {
                        if (item.auth && authLoading) { event.preventDefault(); return }
                        // A modified or non-primary click opens elsewhere: leave this page where it is.
                        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
                        scrollToTopInstant()
                      }}
                      className="coms-footer-link gap-1.5 rounded-sm text-[var(--app-muted)] hover:text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
                    >
                      {item.label}{item.auth && <MemberLock />}
                    </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="coms-footer-wordmark" aria-hidden="true">COM's</p>

        <div className="apple-footer-bottom flex flex-col gap-1 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {new Date().getFullYear()} KW COM&apos;s. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4">
            <a href="https://www.instagram.com/kw_coms" target="_blank" rel="noreferrer" className="coms-footer-link hover:text-[var(--app-text)]">Instagram</a>
            <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className="coms-footer-link hover:text-[var(--app-text)]">GitHub</a>
            <a href="https://www.youtube.com/@kw_coms" target="_blank" rel="noreferrer" className="coms-footer-link hover:text-[var(--app-text)]">YouTube</a>
            <a href="mailto:kwcoms69@gmail.com" className="coms-footer-link hover:text-[var(--app-text)]">메일</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
