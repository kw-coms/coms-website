import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 게시글 신고 다이얼로그.
// promptDialog()는 자유 입력 한 줄만 받으므로 사유 선택에는 쓸 수 없다. 대신
// ConfirmDialog와 같은 coms-confirm-* 마크업/CSS를 그대로 재사용해 모양과 접근성
// (role=dialog, aria-modal, Escape 취소, 포커스 이동/복귀)을 동일하게 맞춘다.

// backend CommunityPostReportService.ALLOWED_REASONS와 1:1. 라벨은 coms-member-app의
// ReportDialog와 동일해 두 클라이언트가 같은 문구를 쓴다.
const REPORT_REASONS = [
  { value: 'SPAM', label: '스팸/광고' },
  { value: 'ABUSE', label: '비방·욕설' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'PROFANITY', label: '음란·혐오 표현' },
  { value: 'MISLEADING', label: '잘못된 정보' },
  { value: 'OTHER', label: '기타' },
]

const MAX_REPORT_DETAIL_LENGTH = 500

export default function ReportPostDialog({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (reason: string, detail: string) => Promise<void>
}) {
  const [reason, setReason] = useState('SPAM')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const selectRef = useRef<HTMLSelectElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const frame = requestAnimationFrame(() => selectRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      restoreFocusRef.current?.focus?.()
    }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(reason, detail.trim())
      onClose()
    } catch (err) {
      // 409(이미 접수됨) 등 백엔드가 의도한 안내는 그대로 보여준다.
      setError(err?.message || '신고 접수 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="coms-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <form
        className="coms-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label="게시글 신고"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !submitting) {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <p className="coms-confirm-title">게시글 신고</p>
        <p className="coms-confirm-message">
          신고 사유를 선택해주세요. 같은 글은 한 번만 신고할 수 있고, 운영진이 확인합니다.
        </p>
        <label className="mt-3 block text-xs font-bold text-[var(--app-subtle)]">
          <span>신고 사유</span>
          <select
            ref={selectRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-2 text-sm font-semibold text-[var(--theme-body-dark)]"
          >
            {REPORT_REASONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs font-bold text-[var(--app-subtle)]">
          <span>상세 설명 (선택)</span>
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            maxLength={MAX_REPORT_DETAIL_LENGTH}
            placeholder="운영진이 빠르게 판단할 수 있도록 구체적으로 알려주세요."
            className="mt-1 w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-2 text-sm text-[var(--theme-body-dark)]"
          />
        </label>
        {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
        <div className="coms-confirm-actions">
          <button type="button" className="coms-confirm-cancel" onClick={onClose} disabled={submitting}>
            취소
          </button>
          <button type="submit" className="coms-confirm-ok is-danger" disabled={submitting}>
            {submitting ? '접수 중...' : '신고 접수'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
