import { useEffect, useState } from 'react'
import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import { clearAdminCache, listAuditLogs } from '../../services/adminApi.js'

const AUDIT_LOG_LIMITS = [300, 1000, 2000]

const AUDIT_LOG_FILTERS = [
  { value: 'ALL', label: '전체 로그' },
  { value: 'COMMUNITY_POST_DELETE', label: '커뮤니티 삭제' },
  { value: 'COMMUNITY_COMMENT_DELETE', label: '댓글 삭제' },
  { value: 'COMMUNITY_REPORT_ACCEPT', label: '신고 처리 완료' },
  { value: 'COMMUNITY_REPORT_REJECT', label: '신고 기각' },
  { value: 'ADMIN_MEMBER_DELETE', label: '회원 삭제' },
  { value: 'ADMIN_ELIGIBLE_MEMBER_DELETE', label: '명부 삭제' },
  { value: 'ADMIN_STUDENT_BAN', label: '학번 차단' },
  { value: 'ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE', label: '모집 상태 변경' },
]

const AUDIT_ACTION_LABELS = {
  COMMUNITY_POST_CREATE: '커뮤니티 글 작성',
  COMMUNITY_POST_UPDATE: '커뮤니티 글 수정',
  COMMUNITY_POST_DELETE: '커뮤니티 글 삭제',
  COMMUNITY_COMMENT_CREATE: '댓글 작성',
  COMMUNITY_COMMENT_UPDATE: '댓글 수정',
  COMMUNITY_COMMENT_DELETE: '댓글 삭제',
  COMMUNITY_POST_VOTE: '추천/비추천',
  COMMUNITY_POLL_VOTE: '투표',
  COMMUNITY_POLL_CLOSE: '투표 종료',
  COMMUNITY_REPORT_ACCEPT: '신고 처리 완료',
  COMMUNITY_REPORT_REJECT: '신고 기각',
  ADMIN_MEMBER_ROLE_UPDATE: '회원 권한 변경',
  ADMIN_MEMBER_DELETE: '회원 삭제',
  ADMIN_MEMBER_PASSWORD_RESET: '비밀번호 초기화',
  ADMIN_ELIGIBLE_MEMBER_ADD: '명부 추가',
  ADMIN_ELIGIBLE_MEMBER_UPDATE: '명부 수정',
  ADMIN_ELIGIBLE_MEMBER_DELETE: '명부 삭제',
  ADMIN_ELIGIBLE_MEMBER_IMPORT: '명부 가져오기',
  ADMIN_STUDENT_BAN: '학번 차단',
  ADMIN_STUDENT_UNBAN: '차단 해제',
  ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE: '모집 상태 변경',
  ADMIN_CACHE_CLEAR: '캐시 초기화',
}

export default function AdminAuditLogs({ formatDateTime }) {
  const [logs, setLogs] = useState([])
  const [limit, setLimit] = useState(1000)
  const [actionFilter, setActionFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheMessage, setCacheMessage] = useState('')
  const [cacheError, setCacheError] = useState('')
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleLogs = logs.filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false
    if (!normalizedSearch) return true
    return auditLogSearchText(log).includes(normalizedSearch)
  })

  const load = async (requestedLimit = limit) => {
    setError('')
    try {
      const data = await listAuditLogs(requestedLimit)
      setLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '로그를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listAuditLogs(limit)
      .then((data) => {
        if (mounted) {
          setError('')
          setLogs(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setError(err.message || '로그를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [limit])

  const handleClearCache = async () => {
    setClearingCache(true)
    setCacheMessage('')
    setCacheError('')
    try {
      const response = await clearAdminCache()
      const count = Number(response?.clearedCount || 0)
      setCacheMessage(`캐시 ${count}개를 초기화했습니다.`)
      setLoading(true)
      await load(limit)
    } catch (err) {
      setCacheError(err.message || '캐시 초기화에 실패했습니다.')
    } finally {
      setClearingCache(false)
    }
  }

  const exportVisibleLogs = () => {
    if (visibleLogs.length === 0) return
    const headers = ['createdAt', 'actorName', 'actorStudentId', 'action', 'targetType', 'targetId', 'ipAddress', 'detail']
    const rows = visibleLogs.map((log) => headers.map((key) => csvCell(log[key] || '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coms-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--theme-body-dark)]">서버 감사 로그</p>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">로그인, 관리자 로그인, 커뮤니티 글/댓글/추천/비추천, 공지사항, 관리자 주요 작업을 최근 {limit.toLocaleString('ko-KR')}건까지 봅니다. 커뮤니티 삭제 로그는 삭제한 관리자와 삭제된 글 스냅샷을 함께 표시합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            <span>종류</span>
            <select
              aria-label="로그 종류"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
            >
              {AUDIT_LOG_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="사용자, 행위, 상세 검색"
            className="shape-cut-sm w-48 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition placeholder:text-[var(--theme-body-muted)] focus:border-black/30"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            <span>로그 표시 개수</span>
            <select
              aria-label="로그 표시 개수"
              value={limit}
              onChange={(event) => {
                setLoading(true)
                setLimit(Number(event.target.value))
              }}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
            >
              {AUDIT_LOG_LIMITS.map((option) => (
                <option key={option} value={option}>{option.toLocaleString('ko-KR')}건</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setLoading(true); load() }}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleClearCache}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            disabled={clearingCache}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {clearingCache ? '초기화 중...' : '캐시 초기화'}
          </button>
          <button
            type="button"
            onClick={exportVisibleLogs}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
            disabled={visibleLogs.length === 0}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>

      {cacheMessage && <p className="shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">{cacheMessage}</p>}
      {cacheError && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{cacheError}</p>}
      {loading && <p className="text-sm text-[var(--theme-body-muted)]">로그를 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && logs.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">저장된 로그가 없습니다.</p>
      )}
      {!loading && !error && logs.length > 0 && visibleLogs.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">선택한 종류의 로그가 없습니다.</p>
      )}
      {!loading && !error && visibleLogs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-hairline)]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
              <tr>
                <th className="px-3 py-3">시간</th>
                <th className="px-3 py-3">사용자</th>
                <th className="px-3 py-3">행위</th>
                <th className="px-3 py-3">대상</th>
                <th className="px-3 py-3">IP</th>
                <th className="px-3 py-3">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(log.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    <span className="font-semibold text-[var(--theme-body-dark)]">{log.actorName || '-'}</span>
                    {log.actorStudentId && <span className="ml-1 font-mono text-[var(--theme-body-muted)]">({log.actorStudentId})</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    <span className="font-semibold text-[#3b4890]">{AUDIT_ACTION_LABELS[log.action] || log.action}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--theme-body-muted)]">{log.action}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">
                    {log.targetType}{log.targetId ? ` #${log.targetId}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--theme-body-muted)]">{log.ipAddress || '-'}</td>
                  <td className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-3 text-xs text-[var(--theme-body-muted)]">{log.detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function auditLogSearchText(log) {
  return [
    log.actorName,
    log.actorStudentId,
    AUDIT_ACTION_LABELS[log.action],
    log.action,
    log.targetType,
    log.targetId,
    log.ipAddress,
    log.detail,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}
