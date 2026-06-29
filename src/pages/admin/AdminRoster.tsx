import { useEffect, useRef, useState } from 'react'
import { importEligibleMembers, addEligibleMember, listEligibleMembers, updateEligibleMember, deleteEligibleMember } from '../../services/adminApi'

export default function AdminRoster() {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [roster, setRoster] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [rosterError, setRosterError] = useState('')
  const [addForm, setAddForm] = useState({ mode: 'current', studentId: '', name: '', admissionYear: '', generation: '' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState('')
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ studentId: '', name: '', phone: '' })
  const [editSaving, setEditSaving] = useState(false)

  const loadRoster = async () => {
    setRosterError('')
    try {
      const data = await listEligibleMembers()
      setRoster(data)
    } catch (err) {
      setRosterError(err.message || '명부를 불러오지 못했습니다.')
    } finally {
      setLoadingRoster(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listEligibleMembers()
      .then((data) => { if (mounted) setRoster(data) })
      .catch((err) => { if (mounted) setRosterError(err.message || '명부를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoadingRoster(false) })
    return () => { mounted = false }
  }, [])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setResult(null)
    setError('')
    try {
      const data = await importEligibleMembers(file)
      setResult(data)
      await loadRoster()
    } catch (err) {
      setError(err.message || '명부를 가져오지 못했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const isGraduate = addForm.mode === 'graduate'
    if (!addForm.name.trim()) return
    if (!isGraduate && !addForm.studentId.trim()) return
    if (isGraduate && !addForm.admissionYear.trim() && !addForm.generation.trim()) return
    if (isGraduate && !addForm.admissionYear.trim() && parseInt(addForm.generation.trim(), 10) < 1) return
    setAdding(true)
    setAddResult('')
    setAddError('')
    try {
      const payload: { name: string; studentId?: string; admissionYear?: string; generation?: string } = { name: addForm.name.trim() }
      if (!isGraduate) {
        payload.studentId = addForm.studentId.trim()
      } else if (addForm.admissionYear.trim()) {
        payload.admissionYear = addForm.admissionYear.trim()
      } else {
        payload.generation = addForm.generation.trim()
      }
      await addEligibleMember(payload)
      const label = !isGraduate
        ? `${addForm.name} (${addForm.studentId})`
        : addForm.admissionYear.trim()
          ? `${addForm.name} (${addForm.admissionYear}학번)`
          : `${addForm.name} (${addForm.generation}기)`
      setAddResult(`${label} 명부에 추가됐습니다.`)
      setAddForm((p) => ({ ...p, studentId: '', name: '', admissionYear: '', generation: '' }))
      await loadRoster()
    } catch (err) {
      setAddError(err.message || '추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (member) => {
    setEditingId(member.id)
    setEditForm({ studentId: member.studentId || '', name: member.name, phone: member.phone || '' })
  }

  const handleEditSave = async (id) => {
    if (!editForm.name.trim()) return
    setEditSaving(true)
    try {
      await updateEligibleMember(id, editForm.studentId.trim() || null, editForm.name.trim(), editForm.phone.trim())
      setEditingId(null)
      await loadRoster()
    } catch (err) {
      alert(err.message || '수정 중 오류가 발생했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`${member.name} (${member.studentId}) 항목을 명부에서 삭제하시겠습니까?`)) return
    try {
      await deleteEligibleMember(member.id)
      setRoster((prev) => prev.filter((m) => m.id !== member.id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const GRAD_BASE_YEAR = 1966
  const currentYY = new Date().getFullYear() % 100

  const thisYear = new Date().getFullYear()

  const handleAdmissionYearChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setAddForm((p) => {
      if (digits.length === 2) {
        const n = parseInt(digits, 10)
        const fullYear = n <= currentYY ? 2000 + n : 1900 + n
        if (fullYear >= GRAD_BASE_YEAR && fullYear <= thisYear) {
          return { ...p, admissionYear: digits, generation: String(fullYear - GRAD_BASE_YEAR) }
        }
      }
      return { ...p, admissionYear: digits }
    })
  }

  const handleGenerationChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setAddForm((p) => {
      const gen = parseInt(digits, 10)
      if (!isNaN(gen) && gen > 0 && gen + GRAD_BASE_YEAR <= thisYear) {
        const twoDigit = String(gen + GRAD_BASE_YEAR).slice(-2)
        return { ...p, generation: digits, admissionYear: twoDigit }
      }
      return { ...p, generation: digits }
    })
  }

  const inputCls = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-2 py-1 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">개별 회원 추가</p>
        <p className="mt-1 text-xs text-[var(--theme-body-muted)]">명부에 직접 추가합니다. 재학생은 10자리 학번, 졸업생은 입학년도 끝 두자리 또는 기수로 추가합니다. 둘 중 하나 입력 시 나머지 자동 계산됩니다.</p>
        <div className="mt-3 flex gap-1">
          {[{ id: 'current', label: '재학생' }, { id: 'graduate', label: '졸업생' }].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setAddForm((p) => ({ ...p, mode: m.id }))}
              className={`shape-cut-sm px-3 py-1 text-xs font-semibold transition ${
                addForm.mode === m.id
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                  : 'border border-[var(--app-hairline)] bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap gap-2">
          {addForm.mode === 'current' ? (
            <input
              value={addForm.studentId}
              onChange={(e) => setAddForm((p) => ({ ...p, studentId: e.target.value }))}
              placeholder="학번 (10자리)"
              maxLength={10}
              className="shape-cut-sm w-40 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={addForm.admissionYear}
                onChange={(e) => handleAdmissionYearChange(e.target.value)}
                placeholder="입학년도 끝 두자리 (예: 19)"
                maxLength={2}
                inputMode="numeric"
                className="shape-cut-sm w-44 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
              />
              <input
                value={addForm.generation}
                onChange={(e) => handleGenerationChange(e.target.value)}
                placeholder="기수 (예: 53)"
                maxLength={2}
                inputMode="numeric"
                className="shape-cut-sm w-32 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
              />
            </div>
          )}
          <input
            value={addForm.name}
            onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="이름"
            maxLength={20}
            className="shape-cut-sm w-32 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
          />
          <button
            type="submit"
            disabled={
              adding || !addForm.name.trim() ||
              (addForm.mode === 'current'
                ? !addForm.studentId.trim()
                : !addForm.admissionYear.trim() && !addForm.generation.trim())
            }
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:opacity-50"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
        {addResult && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{addResult}</p>}
        {addError && <p className="mt-2 text-xs font-semibold text-red-600">{addError}</p>}
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">명부 확인 · 편집</p>
            <p className="mt-1 text-xs text-[var(--theme-body-muted)]">가입 허용 명부에 등록된 학번과 이름을 확인하고 수정합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => { setLoadingRoster(true); loadRoster() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>

        {loadingRoster && <p className="mt-4 text-sm text-[var(--theme-body-muted)]">명부를 불러오는 중...</p>}
        {rosterError && <p className="mt-4 shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{rosterError}</p>}
        {!loadingRoster && !rosterError && roster.length === 0 && (
          <p className="mt-4 text-sm text-[var(--theme-body-muted)]">등록된 명부가 없습니다.</p>
        )}
        {!loadingRoster && !rosterError && roster.length > 0 && (
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-[var(--app-hairline)]">
            <table className="w-max min-w-full table-fixed divide-y divide-black/10 text-left text-sm">
              <colgroup>
                <col style={{ width: '136px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '64px' }} />
                <col style={{ width: '124px' }} />
                <col style={{ width: '88px' }} />
              </colgroup>
              <thead className="sticky top-0 bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">학번</th>
                  <th className="px-3 py-3 whitespace-nowrap">이름</th>
                  <th className="px-3 py-3 whitespace-nowrap">기수</th>
                  <th className="px-3 py-3 whitespace-nowrap">전화번호</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 bg-white/50">
                {roster.map((member) => (
                  <tr key={member.id}>
                    {editingId === member.id ? (
                      <td colSpan={5} className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {editForm.studentId ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-[var(--theme-body-muted)]">학번</span>
                              <input value={editForm.studentId} onChange={(e) => setEditForm((p) => ({ ...p, studentId: e.target.value }))} maxLength={10} className={`${inputCls} w-36`} />
                            </div>
                          ) : (
                            <span className="text-xs italic text-[var(--theme-body-muted)]">졸업생 (학번 없음)</span>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--theme-body-muted)]">이름</span>
                            <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} maxLength={20} className={`${inputCls} w-28`} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--theme-body-muted)]">전화번호</span>
                            <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} maxLength={11} placeholder="01012345678" className={`${inputCls} w-36`} />
                          </div>
                          <div className="flex items-end gap-2 self-end pb-px">
                            <button type="button" onClick={() => handleEditSave(member.id)} disabled={editSaving} className="shape-cut-sm bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--app-accent-hover)] disabled:opacity-50">저장</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline">취소</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--theme-body-dark)]">{member.studentId || '-'}</td>
                        <td className="px-3 py-3 font-semibold text-[var(--theme-body-dark)]">{member.name}</td>
                        <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{member.generation ? `${member.generation}기` : '-'}</td>
                        <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{member.phone || '-'}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-3">
                            <button type="button" onClick={() => startEdit(member)} className="text-xs font-semibold text-blue-500 hover:underline">편집</button>
                            <button type="button" onClick={() => handleDelete(member)} className="text-xs font-semibold text-red-500 hover:underline">삭제</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">명부 일괄 업로드</p>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          엑셀(.xlsx) 또는 구글 폼 CSV를 업로드하면 회원가입 시 학번·이름을 대조합니다.
          전화번호 열이 있으면 저장해 관리자가 확인할 수 있습니다. 기수는 학번에서 자동 계산됩니다.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleUpload}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-3 shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '명부 가져오는 중...' : '명부 업로드 (.xlsx / .csv)'}
        </button>

        {result && (
          <p className="mt-3 shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">
            {result.message} 가져온 행: {result.imported}, 건너뜀: {result.skipped}
          </p>
        )}
        {error && (
          <p className="mt-3 shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
