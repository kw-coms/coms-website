import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { getNotificationSummary, listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notificationApi'
import { useAuth } from '../contexts/useAuth'

const NOTIFICATIONS_QUERY_KEY = ['app-shell', 'notifications']

type NotificationItem = {
  id: string | number
  read?: boolean
  acceptUrl?: string
  type?: string
  noticeId?: string | number
  postId?: string | number
  commentId?: string | number
  [key: string]: unknown
}
type NotificationData = { items: NotificationItem[]; unreadCount: number }

const EMPTY_NOTIFICATIONS: NotificationData = { items: [], unreadCount: 0 }

export default function NotificationButton({ alignLeft = false, variant = 'icon' }: {
  alignLeft?: boolean
  variant?: 'icon' | string
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState({})
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const effectiveOpen = open && Boolean(user)

  const notificationsQuery = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const [list, summary] = await Promise.all([listNotifications(), getNotificationSummary()])
      return {
        items: Array.isArray(list) ? list : [],
        unreadCount: summary?.unreadCount || 0,
      }
    },
    enabled: Boolean(user),
    // Match the previous behavior: a failed fetch shows an empty list, never an error UI.
    placeholderData: (previous) => previous,
  })

  const { items, unreadCount } = notificationsQuery.data ?? EMPTY_NOTIFICATIONS

  const openNotification = async (item) => {
    try {
      await markNotificationRead(item.id)
      queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev: NotificationData | undefined) => {
        const base = prev ?? EMPTY_NOTIFICATIONS
        return {
          items: base.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, base.unreadCount - (item.read ? 0 : 1)),
        }
      })
    } catch {
      // Navigation should still work if the read marker fails.
    }
    setOpen(false)
    const safeAcceptUrl = typeof item.acceptUrl === 'string' && /^https?:\/\//i.test(item.acceptUrl)
    if (safeAcceptUrl) {
      window.open(item.acceptUrl, '_blank', 'noopener,noreferrer')
    } else if (item.type === 'COMMUNITY_POST_DELETED') {
      navigate('/community?view=deleted')
    } else if (item.type === 'RECRUIT_APPLICATION') {
      navigate('/admin?tab=recruit')
    } else if (item.noticeId) {
      navigate(`/notices/${item.noticeId}`)
    } else if (item.postId) {
      navigate(`/community/${item.postId}${item.commentId ? `#comment-${item.commentId}` : ''}`)
    }
  }

  const readAll = async () => {
    await markAllNotificationsRead()
    queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (prev: NotificationData | undefined) => {
      const base = prev ?? EMPTY_NOTIFICATIONS
      return { items: base.items.map((item) => ({ ...item, read: true })), unreadCount: 0 }
    })
  }

  const positionDropdown = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropdownWidth = dropdownRef.current?.offsetWidth || Math.min(352, window.innerWidth - 32)
    const dropdownHeight = dropdownRef.current?.offsetHeight || 0
    const left = alignLeft
      ? Math.min(Math.max(16, rect.left), window.innerWidth - dropdownWidth - 16)
      : Math.min(Math.max(16, rect.right - dropdownWidth), window.innerWidth - dropdownWidth - 16)
    const below = rect.bottom + 8
    const top = below + dropdownHeight <= window.innerHeight - 16
      ? below
      : Math.max(16, rect.top - dropdownHeight - 8)
    setDropdownStyle({ top, left })
  }, [alignLeft])

  useEffect(() => {
    if (!effectiveOpen) return undefined
    positionDropdown()
    window.addEventListener('scroll', positionDropdown, true)
    window.addEventListener('resize', positionDropdown)
    return () => {
      window.removeEventListener('scroll', positionDropdown, true)
      window.removeEventListener('resize', positionDropdown)
    }
  }, [effectiveOpen, positionDropdown])

  const toggle = () => {
    setOpen((v) => !v)
    if (user) notificationsQuery.refetch()
  }

  if (!user) return null
  const mobileMenu = variant === 'mobileMenu'

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={mobileMenu
          ? 'apple-mobile-menu-item apple-mobile-menu-notification'
          : 'relative inline-flex size-9 items-center justify-center rounded-full text-[var(--theme-body-dark)] transition hover:bg-black/5'}
        aria-label="notifications"
      >
        {mobileMenu ? (
          <>
            <Bell size={15} className="text-blue-500" />
            <span>알림</span>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : '새 알림 없음'}
            </span>
          </>
        ) : (
          <>
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>
      {effectiveOpen && createPortal(
        <div
          ref={dropdownRef}
          className="theme-popover fixed z-[9999] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--theme-body-dark)] shadow-2xl"
          style={dropdownStyle}
        >
          <div className="flex items-center justify-between border-b border-[var(--app-hairline)] px-4 py-3">
            <span className="text-sm font-black">알림</span>
            <button type="button" onClick={readAll} className="text-xs font-bold text-[#3b4890] hover:underline">모두 읽음</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--theme-body-muted)]">새 알림이 없습니다.</p>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`notification-row block w-full border-b border-black/8 px-4 py-3 text-left text-sm last:border-b-0 ${item.read ? 'notification-row-read' : 'notification-row-unread'}`}
              >
                <span className="flex items-start gap-2">
                  <span className="notification-dot mt-1.5" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {item.actorLabel && (
                      <span className="mb-1 inline-block rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--theme-body-muted)]">{item.actorLabel}</span>
                    )}
                    <span className={`block ${item.read ? 'font-medium' : 'font-bold'}`}>{item.message}</span>
                    {item.acceptUrl && (
                      <span className="mt-1 block text-[11px] font-bold text-[#3b4890]">눌러서 수락하러 가기 →</span>
                    )}
                    <span className="mt-1 block text-[11px] text-[var(--theme-body-muted)]">{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
