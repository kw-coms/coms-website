import { useEffect, useMemo, useState } from 'react'
import {
  getPermissionMatrix,
  updatePermissionMatrix,
  type PermissionMatrix,
} from '../../services/permissionsApi'
import { showToast } from '../../components/common/Toast'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import { useAuth } from '../../contexts/useAuth'
import { ROLE_LABELS, defaultPermissionsForRole } from '../../utils/roleAccess'

type Allowed = Record<string, string[]>

function normalize(allowed: Allowed): Allowed {
  return Object.fromEntries(
    Object.entries(allowed).map(([role, keys]) => [role, [...keys].sort()])
  )
}

function sameMatrix(a: Allowed, b: Allowed) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('ko-KR')
}

export default function AdminPermissions() {
  const { refreshPermissions } = useAuth()
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null)
  const [draft, setDraft] = useState<Allowed>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    getPermissionMatrix()
      .then((data) => {
        if (!mounted) return
        setMatrix(data)
        setDraft(data.allowed || {})
      })
      .catch((err) => { if (mounted) setError(err.message || '권한 매트릭스를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const dirty = useMemo(
    () => Boolean(matrix) && !sameMatrix(draft, matrix?.allowed || {}),
    [draft, matrix]
  )

  const toggle = (role: string, key: string) => {
    setDraft((previous) => {
      const current = previous[role] || []
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
      return { ...previous, [role]: next }
    })
  }

  const resetToDefaults = () => {
    if (!matrix) return
    if (!window.confirm('모든 직급의 권한을 기본값으로 되돌립니다. 계속할까요?')) return
    setDraft(Object.fromEntries(
      matrix.roles.map((role) => [role, [...defaultPermissionsForRole(role)]])
    ))
  }

  const save = async () => {
    if (!matrix) return
    setSaving(true)
    try {
      const saved = await updatePermissionMatrix(draft, matrix.updatedAt)
      setMatrix(saved)
      setDraft(saved.allowed || {})
      refreshPermissions()
      showToast({ message: '권한이 저장되었습니다.' })
    } catch (err) {
      showToast({ message: err.message || '저장 중 오류가 발생했습니다.', tone: 'error' })
      // 409: 다른 관리자가 먼저 저장했다 — 화면이 든 매트릭스가 낡았으니 다시 불러와
      // 새 updatedAt 기준으로 다시 시도할 수 있게 한다.
      if (err.status === 409) {
        try {
          const fresh = await getPermissionMatrix()
          setMatrix(fresh)
          setDraft(fresh.allowed || {})
        } catch {
          // 재조회 실패는 무시 — 사용자는 이미 토스트로 안내받았고, 저장 버튼을 다시 누르면
          // useEffect 를 거치지 않아도 되는 이 재조회가 다시 시도된다.
        }
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SkeletonGroup label="권한 매트릭스를 불러오는 중">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </SkeletonGroup>
    )
  }

  if (error || !matrix) {
    return <p className="text-sm text-[var(--theme-body-muted)]">{error || '권한 매트릭스를 불러오지 못했습니다.'}</p>
  }

  const updatedAt = formatUpdatedAt(matrix.updatedAt)

  return (
    <section className="space-y-4" data-testid="admin-permissions">
      <div>
        <h2 className="text-base font-bold text-[var(--theme-body-dark)]">직급별 권한</h2>
        <p className="mt-1 text-sm text-[var(--theme-body-muted)]">
          직급마다 어떤 기능을 열어줄지 회장이 직접 정합니다. 회장(회장 열)은 항상 모든 권한을 가지며 조정할 수 없습니다.
        </p>
        {updatedAt && (
          <p className="mt-1 text-xs text-[var(--theme-body-muted)]">
            마지막 변경: {updatedAt}
            {matrix.updatedBy ? ` · ${matrix.updatedBy}` : ''}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--app-hairline)] text-left">
              <th scope="col" className="py-2 pr-3 font-bold text-[var(--theme-body-dark)]">권한</th>
              {matrix.roles.map((role) => (
                <th key={role} scope="col" className="px-2 py-2 text-center font-bold text-[var(--theme-body-dark)]">
                  {ROLE_LABELS[role] || role}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-center font-bold text-[var(--theme-body-muted)]">회장</th>
            </tr>
          </thead>
          <tbody>
            {matrix.permissions.map((permission) => (
              <tr key={permission.key} className="border-b border-[var(--app-hairline)] align-top">
                <th scope="row" className="py-3 pr-3 text-left font-semibold text-[var(--theme-body-dark)]">
                  {permission.label}
                  <span className="mt-0.5 block text-xs font-normal text-[var(--theme-body-muted)]">
                    {permission.description}
                  </span>
                </th>
                {matrix.roles.map((role) => (
                  <td key={role} className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--app-accent)]"
                      checked={(draft[role] || []).includes(permission.key)}
                      disabled={saving}
                      onChange={() => toggle(role, permission.key)}
                      aria-label={`${ROLE_LABELS[role] || role} — ${permission.label}`}
                    />
                  </td>
                ))}
                <td className="px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--app-accent)]"
                    checked
                    disabled
                    aria-label={`회장 — ${permission.label} (항상 허용)`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-full bg-[var(--app-accent)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--app-accent-hover)] disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          type="button"
          onClick={resetToDefaults}
          disabled={saving}
          className="rounded-full border border-[var(--app-hairline)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60 disabled:opacity-50"
        >
          기본값으로 되돌리기
        </button>
        {dirty && <span className="text-xs text-[var(--theme-body-muted)]">저장하지 않은 변경이 있습니다.</span>}
      </div>
    </section>
  )
}
