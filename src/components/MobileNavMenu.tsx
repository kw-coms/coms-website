import { useEffect } from 'react'
import { Compass, LogOut, X } from 'lucide-react'
import { getLogoAsset } from '../utils/logoAssets'
import { useAuth } from '../contexts/useAuth'
import { usePermissions } from '../contexts/usePermissions'
import { navGroups, type NavItem } from '../data/homeContent'
import { ROLE_LABELS, canAccessOperationsPanel } from '../utils/roleAccess'
import { useModalFocus } from '../hooks/useModalFocus'
import { startSiteTour } from './tour/tourState'
import NotificationButton from './NotificationButton'
import MemberLock from './MemberLock'

type Props = {
  /** Paths of the most visited items; empty until the visitor has enough visits. */
  frequent: NavItem[]
  activePath: string | null
  onGo: (path: string, options?: { auth?: boolean }) => void
  onLogout: () => void
  onClose: () => void
  guidedPreview?: boolean
}

/**
 * The phone menu: a full-screen overlay with all four groups open, so nothing hides behind a
 * second tap. It is modal: focus stays inside, Escape closes, the page behind does not scroll.
 */
export default function MobileNavMenu({ frequent, activePath, onGo, onLogout, onClose, guidedPreview = false }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { permissions } = usePermissions()
  const containerRef = useModalFocus(!guidedPreview, onClose)

  useEffect(() => {
    if (guidedPreview) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [guidedPreview])

  const row = (item: NavItem) => (
    <li key={item.id}>
      <button
        type="button"
        className="nav-m-item"
        data-tour-path={item.path}
        aria-current={activePath === item.path ? 'page' : undefined}
        disabled={item.auth && authLoading}
        onClick={() => onGo(item.path, { auth: item.auth })}
      >
        <item.icon size={17} aria-hidden="true" className="nav-m-icon" />
        <span className="nav-m-label">{item.label}</span>
        {item.auth && <MemberLock />}
        <span className="nav-m-sub" aria-hidden="true">{item.sub}</span>
      </button>
    </li>
  )

  return (
    <div ref={containerRef} className="nav-m-overlay" data-tour-guided={guidedPreview ? 'true' : undefined}
      role={guidedPreview ? undefined : 'dialog'} aria-modal={guidedPreview ? undefined : 'true'} aria-label="메뉴">
      <div className="nav-m-top">
        <span className="nav-m-brand">
          <img src={getLogoAsset('COMs_logo_vec')} alt="" className="h-6 w-6 shrink-0 object-contain" />
          <span>KW COM&apos;s</span>
        </span>
        <button type="button" className="nav-m-close" onClick={onClose} aria-label="메뉴 닫기">
          <X size={21} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </div>
      <nav id="mobile-menu" aria-label="모바일 메뉴" className="nav-m-body">
        {frequent.length > 0 && (
          <section aria-labelledby="nav-m-frequent" className="nav-m-section">
            <p id="nav-m-frequent" className="nav-m-title">자주 가는 곳</p>
            <ul>{frequent.map(row)}</ul>
          </section>
        )}
        {navGroups.map((group) => (
          <section key={group.id} data-tour-group={group.id} aria-labelledby={`nav-m-${group.id}`} className="nav-m-section">
            <p id={`nav-m-${group.id}`} className="nav-m-title">{group.label}<span>{group.sub}</span></p>
            <ul>{group.items.map(row)}</ul>
          </section>
        ))}
        <section className="nav-m-section" aria-label="도움말">
          <ul>
            <li>
              <button type="button" className="nav-m-item" onClick={() => { onClose(); startSiteTour() }}>
                <Compass size={17} aria-hidden="true" className="nav-m-icon" />
                <span className="nav-m-label">튜토리얼 시작</span>
                <span className="nav-m-sub">사이트 둘러보기</span>
              </button>
            </li>
          </ul>
        </section>
        <section className="nav-m-section nav-m-account" aria-label="계정">
          {!user ? (
            <button type="button" onClick={() => onGo('/login')} data-tour="login" disabled={authLoading} className="nav-m-login">로그인</button>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--app-hairline)]">
              <button type="button" onClick={() => onGo('/settings')} data-tour="account" className="apple-mobile-menu-item">
                <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-black">{user.name?.[0] ?? '?'}</span>
                <span>{user.name}</span>
                <span className="ml-auto text-xs text-[var(--app-muted)]">계정 설정</span>
              </button>
              {canAccessOperationsPanel(permissions) && (
                <button type="button" onClick={() => onGo('/admin')} className="apple-mobile-menu-item apple-mobile-menu-item-warning">
                  <span>{(ROLE_LABELS[user.role] || '임원') + ' 패널'}</span>
                </button>
              )}
              <NotificationButton alignLeft variant="mobileMenu" />
              <button type="button" onClick={onLogout} className="apple-mobile-menu-item">
                <LogOut size={15} aria-hidden="true" />
                <span>로그아웃</span>
              </button>
            </div>
          )}
        </section>
      </nav>
    </div>
  )
}
