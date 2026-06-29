import { Moon, Sun } from 'lucide-react'
import { accentSwatches, footerLinkGroups } from '../data/homeContent'
import { DEFAULT_ACCENT, normalizeHex } from '../utils/themeColors'

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
}: any) {
  const accent = normalizeHex(accentColor)
  const isDark = themeMode === 'dark'
  const fontSelectValue = selectedFontId ? String(selectedFontId) : ''

  return (
    <section className="appearance-control apple-footer-surface border-t border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-5 py-8 text-[var(--app-muted)]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="apple-footer-note border-b border-[var(--app-hairline)] pb-5 text-xs leading-5">
          <p>KW COM&apos;s는 광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리입니다.</p>
          <p className="mt-2">활동 안내와 모집 일정은 공지사항을 통해 순차적으로 공개됩니다.</p>
        </div>

        <div className="appearance-panel grid gap-4 border-b border-[var(--app-hairline)] py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-subtle)]">Appearance</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--app-text)]">화면 설정</h2>
          </div>

          <div className="appearance-actions flex min-w-0 flex-col gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
              className="appearance-mode-toggle inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] sm:w-auto"
              aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              <span className="grid size-6 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-text)]">
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </span>
              {isDark ? '라이트 모드' : '다크 모드'}
            </button>

            {activeFonts.length > 0 && (
              <div className="appearance-font-row flex flex-wrap items-center gap-2 lg:justify-end" aria-label="폰트 설정">
                <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">폰트</span>
                <span className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-muted)]">
                  {fontSelectionLocked ? '내 계정에 저장됨' : '이 브라우저에 임시 적용'}
                </span>
                {fontSelectionLocked ? (
                  <button
                    type="button"
                    onClick={onOpenAccountSettings}
                    className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)] hover:text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30"
                  >
                    계정 설정에서 폰트 변경
                  </button>
                ) : (
                  <select
                    value={fontSelectValue}
                    onChange={(event) => onFontChange?.(event.target.value)}
                    className="min-h-9 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/30"
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

            <div className="appearance-color-row flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">색상</span>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] p-1.5">
                {accentSwatches.map((swatch) => {
                  const active = accent === swatch.value
                  return (
                    <button
                      key={swatch.value}
                      type="button"
                      onClick={() => setAccentColor(swatch.value)}
                      className={`relative grid size-11 min-h-11 min-w-11 place-items-center rounded-full transition hover:scale-105 sm:size-8 sm:min-h-8 sm:min-w-8 ${active ? 'ring-2 ring-[var(--app-text)] ring-offset-2 ring-offset-[var(--app-surface)]' : ''}`}
                      style={{ backgroundColor: swatch.value }}
                      aria-label={`${swatch.name} 색상 선택`}
                      title={swatch.name}
                    >
                      {active && <span className="size-2.5 rounded-full bg-[var(--app-surface)] shadow-[0_1px_4px_rgba(0,0,0,0.28)] sm:size-2" />}
                    </button>
                  )
                })}
              </div>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)]">
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
                className="min-h-9 rounded-full border border-[var(--app-hairline)] bg-transparent px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="apple-footer-directory grid gap-x-10 gap-y-6 border-b border-[var(--app-hairline)] py-5 text-xs sm:grid-cols-3">
          {footerLinkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-[var(--app-text)]">{group.title}</h3>
              <ul className="mt-2 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noreferrer' : undefined}
                      className="text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="apple-footer-bottom flex flex-col gap-3 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {new Date().getFullYear()} KW COM&apos;s. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/notices" className="hover:text-[var(--app-text)]">Notices</a>
            <a href="/community" className="hover:text-[var(--app-text)]">Community</a>
            <a href="mailto:kwcoms69@gmail.com" className="hover:text-[var(--app-text)]">Contact</a>
          </div>
        </div>
      </div>
    </section>
  )
}
