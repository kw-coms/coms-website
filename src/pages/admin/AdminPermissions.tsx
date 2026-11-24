import { useEffect, useMemo, useState } from 'react'
import {
  getPermissionMatrix,
  updatePermissionMatrix,
  searchPermissionMembers,
  listMemberPermissionOverrides,
  getMemberPermissionOverrides,
  updateMemberPermissionOverrides,
  type PermissionDescriptor,
  type PermissionMatrix,
  type PermissionMember,
  type PermissionEffect,
  type MemberPermissionOverrides,
  type MemberPermissionDetail,
} from '../../services/permissionsApi'
import { showToast } from '../../components/common/Toast'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import { useAuth } from '../../contexts/useAuth'
import { ROLE_LABELS, defaultPermissionsForRole } from '../../utils/roleAccess'
import { ListSearch } from '../../components/common/ListTools'

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
    <section className="space-y-8" data-testid="admin-permissions">
      <div className="space-y-4">
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
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--app-hairline)] text-left">
              <th scope="col" className="py-2 pr-2 font-bold text-[var(--theme-body-dark)]">권한</th>
              {matrix.roles.map((role) => (
                <th key={role} scope="col" className="w-11 px-0.5 py-2 text-center text-[11px] font-bold leading-tight text-[var(--theme-body-dark)] sm:w-14 sm:text-xs">
                  {ROLE_LABELS[role] || role}
                </th>
              ))}
              <th scope="col" className="w-11 px-0.5 py-2 text-center text-[11px] font-bold leading-tight text-[var(--theme-body-muted)] sm:w-14 sm:text-xs">회장</th>
            </tr>
          </thead>
          <tbody>
            {matrix.permissions.map((permission) => (
              <tr key={permission.key} className="border-b border-[var(--app-hairline)] align-top">
                <th scope="row" className="py-3 pr-2 text-left font-semibold break-keep text-[var(--theme-body-dark)]">
                  {permission.label}
                  <span className="mt-0.5 block text-xs font-normal text-[var(--theme-body-muted)]">
                    {permission.description}
                  </span>
                </th>
                {matrix.roles.map((role) => (
                  <td key={role} className="px-0.5 py-3 text-center">
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
                <td className="px-0.5 py-3 text-center">
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
      </div>
      <MemberPermissions permissions={matrix.permissions} refreshPermissions={refreshPermissions} />
    </section>
  )
}

function MemberPermissions({ permissions, refreshPermissions }: {
  permissions: PermissionDescriptor[]
  refreshPermissions: () => void
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<PermissionMember[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [overrideMembers, setOverrideMembers] = useState<MemberPermissionOverrides[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [listNonce, setListNonce] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<MemberPermissionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailNonce, setDetailNonce] = useState(0)
  const [draft, setDraft] = useState<Record<string, PermissionEffect>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    listMemberPermissionOverrides()
      .then((rows) => { if (active) { setOverrideMembers(rows); setListError('') } })
      .catch((err) => { if (active) setListError(err.message || '개인별 권한 목록을 불러오지 못했습니다.') })
      .finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [listNonce])

  useEffect(() => {
    const value = query.trim()
    if (!value) return
    let active = true
    const timer = window.setTimeout(() => {
      searchPermissionMembers(value)
        .then((rows) => { if (active) { setMatches(rows); setSearchError('') } })
        .catch((err) => { if (active) setSearchError(err.message || '회원을 검색하지 못했습니다.') })
        .finally(() => { if (active) setSearching(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    getMemberPermissionOverrides(selectedId)
      .then((value) => {
        if (active) { setDetail(value); setDraft(value.overrides); setDetailError('') }
      })
      .catch((err) => { if (active) setDetailError(err.message || '회원 권한을 불러오지 못했습니다.') })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedId, detailNonce])

  const selectMember = (studentId: string) => {
    if (saving || studentId === selectedId) return
    setSelectedId(studentId)
    setDetail(null)
    setDraft({})
    setDetailLoading(true)
    setDetailError('')
  }

  const changeEffect = (key: string, effect: '' | PermissionEffect) => {
    setDraft((current) => {
      const next = { ...current }
      if (effect) next[key] = effect
      else delete next[key]
      return next
    })
  }

  const changed = detail && JSON.stringify(Object.entries(draft).sort()) !== JSON.stringify(Object.entries(detail.overrides).sort())
  const save = async () => {
    if (!detail || !changed || saving) return
    setSaving(true)
    try {
      const saved = await updateMemberPermissionOverrides(detail.studentId, draft)
      setDetail(saved)
      setDraft(saved.overrides)
      setListNonce((value) => value + 1)
      refreshPermissions()
      showToast({ message: '개인별 권한이 저장되었습니다.' })
    } catch (err) {
      showToast({ message: err.message || '개인별 권한을 저장하지 못했습니다.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 border-t border-[var(--app-hairline)] pt-6" aria-labelledby="member-permissions-title">
      <div>
        <h2 id="member-permissions-title" className="text-base font-bold text-[var(--theme-body-dark)]">개인별 권한</h2>
        <p className="mt-1 text-sm text-[var(--theme-body-muted)]">기본은 직급 권한을 따릅니다. 허용과 차단은 해당 회원에게만 적용됩니다.</p>
      </div>
      <div className="max-w-xl">
        <ListSearch value={query} onChange={(value) => {
          setQuery(value)
          setMatches([])
          setSearchError('')
          setSearching(Boolean(value.trim()))
        }} placeholder="이름 또는 학번" label="개인별 권한 회원 검색" />
      </div>
      {searching && <p role="status" className="text-sm text-[var(--theme-body-muted)]">회원 검색 중…</p>}
      {searchError && <p role="alert" className="text-sm text-red-600">{searchError}</p>}
      {query.trim() && !searching && !searchError && matches.length === 0 && <p className="text-sm text-[var(--theme-body-muted)]">검색 결과가 없습니다.</p>}
      {matches.length > 0 && <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="회원 검색 결과">
        {matches.map((member) => <li key={member.studentId}>
          <button type="button" disabled={saving} onClick={() => selectMember(member.studentId)} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-[var(--theme-body-dark)] hover:bg-black/5 disabled:opacity-50">
            {member.name} · {member.studentId} · {ROLE_LABELS[member.role] || member.role}
          </button>
        </li>)}
      </ul>}
      <div>
        <h3 className="text-sm font-bold text-[var(--theme-body-dark)]">개인 설정이 있는 회원</h3>
        {listLoading && <p role="status" className="mt-2 text-sm text-[var(--theme-body-muted)]">목록을 불러오는 중…</p>}
        {listError && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-600" role="alert">{listError}
          <button type="button" onClick={() => { setListLoading(true); setListNonce((value) => value + 1) }} className="min-h-11 rounded-lg border border-[var(--app-hairline)] px-3 text-[var(--theme-body-dark)]">다시 시도</button>
        </div>}
        {!listLoading && !listError && overrideMembers.length === 0 && <p className="mt-2 text-sm text-[var(--theme-body-muted)]">개인 설정이 없습니다.</p>}
        {!listLoading && !listError && overrideMembers.length > 0 && <ul className="mt-2 flex flex-wrap gap-2" aria-label="개인 설정 회원 목록">
          {overrideMembers.map((member) => <li key={member.studentId}>
            <button type="button" disabled={saving} onClick={() => selectMember(member.studentId)} className="min-h-11 rounded-lg border border-[var(--app-hairline)] px-3 text-sm text-[var(--theme-body-dark)] hover:bg-black/5 disabled:opacity-50">
              {member.name} · {member.studentId} · {Object.keys(member.overrides).length}개
            </button>
          </li>)}
        </ul>}
      </div>
      {selectedId && <div className="space-y-3 rounded-xl border border-[var(--app-hairline)] bg-white/60 p-4">
        {detailLoading && <p role="status" className="text-sm text-[var(--theme-body-muted)]">회원 권한을 불러오는 중…</p>}
        {detailError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-600">{detailError}
          <button type="button" onClick={() => { setDetailLoading(true); setDetailNonce((value) => value + 1) }} className="min-h-11 rounded-lg border border-[var(--app-hairline)] px-3 text-[var(--theme-body-dark)]">다시 시도</button>
        </div>}
        {detail && !detailLoading && !detailError && <>
          <div>
            <h3 className="font-bold text-[var(--theme-body-dark)]">{detail.name} · {detail.studentId}</h3>
            <p className="text-sm text-[var(--theme-body-muted)]">{ROLE_LABELS[detail.role] || detail.role} · 직급 기본 권한은 회색으로 표시됩니다.</p>
          </div>
          <div className="space-y-2">
            {permissions.map((permission) => {
              const base = detail.rolePermissions.includes(permission.key)
              const effect = draft[permission.key] || ''
              return <div key={permission.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-hairline)] py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--theme-body-dark)]">{permission.label}</p>
                  <p className="text-xs text-[var(--theme-body-muted)]">{permission.description}</p>
                  <span className="text-xs text-[var(--theme-body-muted)]">직급 기본: {base ? '허용' : '차단'}</span>
                </div>
                <select aria-label={`${detail.name} ${permission.label} 개인 설정`} value={effect} disabled={detail.role === 'ADMIN' || saving} onChange={(event) => changeEffect(permission.key, event.target.value as '' | PermissionEffect)} className="min-h-11 rounded-lg border border-[var(--app-hairline)] bg-white px-3 text-sm text-[var(--theme-body-dark)] disabled:opacity-50">
                  <option value="">기본</option>
                  <option value="GRANT">허용</option>
                  <option value="REVOKE">차단</option>
                </select>
              </div>
            })}
          </div>
          <button type="button" onClick={save} disabled={!changed || saving || detail.role === 'ADMIN'} className="min-h-11 rounded-full bg-[var(--app-accent)] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? '저장 중…' : '개인별 권한 저장'}</button>
          {detail.role === 'ADMIN' && <p className="text-xs text-[var(--theme-body-muted)]">회장은 항상 모든 권한을 가집니다.</p>}
        </>}
      </div>}
    </section>
  )
}
