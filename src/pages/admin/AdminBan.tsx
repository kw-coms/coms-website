import { useEffect, useState } from 'react'
import { listBannedStudents, banStudent, unbanStudent } from '../../services/adminApi'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

const BAN_DURATIONS = [
  { value: '6H', label: '6시간' },
  { value: '12H', label: '12시간' },
  { value: '24H', label: '24시간' },
  { value: '3D', label: '3일' },
  { value: '7D', label: '7일' },
  { value: '31D', label: '31일' },
  { value: '3M', label: '3달' },
  { value: '6M', label: '6달' },
  { value: '1Y', label: '1년' },
  { value: '3Y', label: '3년' },
]

export default function AdminBan({ formatDateTime }: { formatDateTime: (value: string) => string }) {
  const [banned, setBanned] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [duration, setDuration] = useState(BAN_DURATIONS[0].value)
  const [error, setError] = useState('')

  const load = () => {
    listBannedStudents()
      .then(setBanned)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listBannedStudents()
      .then(d => { if (mounted) setBanned(d) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleBan = async (e) => {
    e.preventDefault()
    const id = input.trim()
    if (!id) return
    setError('')
    try {
      await banStudent(id, duration)
      setInput('')
      await load()
    } catch (err) {
      setError(err.message || '차단 중 오류가 발생했습니다.')
    }
  }

  const handleUnban = async (studentId) => {
    if (!(await confirmDialog({ message: `${studentId} 차단을 해제하시겠습니까?`, tone: 'danger' }))) return
    try {
      await unbanStudent(studentId)
      await load()
    } catch (err) {
      showToast({ message: err.message || '해제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const inputCls = 'rounded border border-black/15 bg-[var(--app-surface)] px-2 py-1 text-sm outline-none focus:border-black/40'

  return (
    <div className="space-y-6">
      <form onSubmit={handleBan} className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="학번 10자리"
          maxLength={10}
          className={`${inputCls} w-40`}
        />
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={`${inputCls} w-28`}
        >
          {BAN_DURATIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <button type="submit" className="shape-cut-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          임시 차단
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </form>

      {loading ? (
        <SkeletonGroup label="차단 목록을 불러오는 중">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      ) : banned.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">차단된 학번이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--app-hairline)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--theme-body-muted)]">
                <th className="px-3 py-2">학번</th>
                <th className="px-3 py-2">차단일</th>
                <th className="px-3 py-2">만료</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {banned.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-3 font-mono text-xs text-[var(--theme-body-dark)]">{b.studentId}</td>
                  <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(b.bannedAt)}</td>
                  <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(b.expiresAt)}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => handleUnban(b.studentId)} className="text-xs font-semibold text-blue-500 hover:underline">
                      차단 해제
                    </button>
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
