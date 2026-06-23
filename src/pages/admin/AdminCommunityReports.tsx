import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { listCommunityReports, resolveCommunityReport } from '../../services/adminApi'

const COMMUNITY_REPORT_REASONS = {
  SPAM: '스팸/홍보',
  ABUSE: '비방/괴롭힘',
  PRIVACY: '개인정보',
  PROFANITY: '욕설/혐오',
  MISLEADING: '허위/오해 소지',
  OTHER: '기타',
}

export default function AdminCommunityReports({ formatDateTime }: any) {
  const [reports, setReports] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = async () => {
    setError('')
    try {
      const data = await listCommunityReports()
      setReports(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '신고 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listCommunityReports()
      .then((data) => {
        if (mounted) {
          setError('')
          setReports(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setError(err.message || '신고 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const resolveReport = async (report, action) => {
    const verb = action === 'ACCEPT' ? '처리 완료' : '기각'
    if (!window.confirm(`신고 #${report.id}을 ${verb}하시겠습니까?`)) return
    setWorkingId(report.id)
    try {
      await resolveCommunityReport(report.id, { action, note: notes[report.id] || '' })
      setReports((prev) => prev.filter((item) => item.id !== report.id))
      setNotes((prev) => {
        const next = { ...prev }
        delete next[report.id]
        return next
      })
    } catch (err) {
      alert(err.message || '신고 처리 중 오류가 발생했습니다.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">커뮤니티 신고 큐</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            접수된 게시글 신고를 확인하고 처리 결과와 운영 메모를 남깁니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); load() }}
          className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          새로고침
        </button>
      </div>

      {loading && <p className="text-sm text-[var(--theme-body-muted)]">신고 목록을 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && reports.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">처리 대기 중인 신고가 없습니다.</p>
      )}
      {!loading && !error && reports.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-hairline)]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
              <tr>
                <th className="px-3 py-3">접수</th>
                <th className="px-3 py-3">게시글</th>
                <th className="px-3 py-3">신고자</th>
                <th className="px-3 py-3">사유</th>
                <th className="px-3 py-3">상세</th>
                <th className="px-3 py-3">처리 메모</th>
                <th className="px-3 py-3">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(report.createdAt)}</td>
                  <td className="max-w-[260px] px-3 py-3 text-xs">
                    <span className="block break-words font-semibold text-[#3b4890]">{report.postTitle || '삭제되었거나 찾을 수 없는 글'}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--theme-body-muted)]">#{report.postId}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--theme-body-muted)]">{report.reporterStudentId}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-[var(--theme-body-dark)]">{COMMUNITY_REPORT_REASONS[report.reason] || report.reason}</td>
                  <td className="max-w-[320px] whitespace-pre-wrap break-words px-3 py-3 text-xs text-[var(--theme-body-muted)]">{report.detail || '-'}</td>
                  <td className="px-3 py-3">
                    <input
                      value={notes[report.id] || ''}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [report.id]: event.target.value }))}
                      placeholder="운영 메모"
                      maxLength={500}
                      className="w-56 rounded border border-black/15 bg-[var(--app-surface)] px-2 py-1.5 text-xs outline-none focus:border-black/40"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => resolveReport(report, 'ACCEPT')}
                        disabled={workingId !== null}
                        className="shape-cut-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {workingId === report.id ? '처리 중...' : '처리 완료'}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveReport(report, 'REJECT')}
                        disabled={workingId !== null}
                        className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface)] disabled:opacity-50"
                      >
                        기각
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
