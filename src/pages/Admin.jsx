import { useEffect, useRef, useState } from 'react'
import { listMembers, updateMemberRole, deleteMember, importEligibleMembers, addEligibleMember, listEligibleMembers, updateEligibleMember, deleteEligibleMember } from '../services/adminApi.js'
import { listFiles, uploadFile, deleteFile } from '../services/archiveApi.js'
import { useAuth } from '../contexts/useAuth.js'

export default function Admin({ onBack }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('members')

  if (user?.role !== 'ADMIN') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
        <p className="text-center text-[var(--theme-body-dark)]">접근 권한이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className="shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">Admin</p>
          <h1 className="mt-2 mb-6 text-2xl font-bold sm:text-3xl">관리자 패널</h1>

          <div className="mb-6 flex gap-2">
            {[
              { id: 'members', label: '회원 관리' },
              { id: 'roster', label: '명부 인증' },
              { id: 'files', label: '파일 관리' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shape-cut-sm px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                    : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'members' && <MembersTab currentUser={user} />}
          {activeTab === 'roster' && <RosterTab />}
          {activeTab === 'files' && <FilesTab />}
        </section>
      </div>
    </div>
  )
}

function parseInterests(raw) {
  if (!raw) return []
  return raw.split(',').map((item) => {
    if (item.startsWith('기타:')) return `기타 (${item.slice(3)})`
    return item
  })
}

function RosterTab() {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [roster, setRoster] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [rosterError, setRosterError] = useState('')
  const [addForm, setAddForm] = useState({ studentId: '', name: '' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState('')
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ studentId: '', name: '' })
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
    if (!addForm.studentId.trim() || !addForm.name.trim()) return
    setAdding(true)
    setAddResult('')
    setAddError('')
    try {
      await addEligibleMember(addForm.studentId.trim(), addForm.name.trim())
      setAddResult(`${addForm.name} (${addForm.studentId}) 명부에 추가됐습니다.`)
      setAddForm({ studentId: '', name: '' })
      await loadRoster()
    } catch (err) {
      setAddError(err.message || '추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (member) => {
    setEditingId(member.id)
    setEditForm({ studentId: member.studentId || '', name: member.name })
  }

  const handleEditSave = async (id) => {
    if (!editForm.studentId.trim() || !editForm.name.trim()) return
    setEditSaving(true)
    try {
      await updateEligibleMember(id, editForm.studentId.trim(), editForm.name.trim())
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

  const inputCls = 'shape-cut-sm border border-black/10 bg-white/70 px-2 py-1 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-black/10 bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">개별 회원 추가</p>
        <p className="mt-1 text-xs text-[var(--theme-body-muted)]">학번과 이름을 입력해 명부에 직접 추가합니다.</p>
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap gap-2">
          <input
            value={addForm.studentId}
            onChange={(e) => setAddForm((p) => ({ ...p, studentId: e.target.value }))}
            placeholder="학번 (10자리)"
            maxLength={10}
            className="shape-cut-sm w-40 border border-black/10 bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
          />
          <input
            value={addForm.name}
            onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="이름"
            maxLength={20}
            className="shape-cut-sm w-32 border border-black/10 bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
          />
          <button
            type="submit"
            disabled={adding || !addForm.studentId.trim() || !addForm.name.trim()}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:opacity-50"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
        {addResult && <p className="mt-2 text-xs font-semibold text-emerald-700">{addResult}</p>}
        {addError && <p className="mt-2 text-xs font-semibold text-red-600">{addError}</p>}
      </div>

      <div className="rounded-lg border border-black/10 bg-black/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">명부 확인 · 편집</p>
            <p className="mt-1 text-xs text-[var(--theme-body-muted)]">가입 허용 명부에 등록된 학번과 이름을 확인하고 수정합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => { setLoadingRoster(true); loadRoster() }}
            className="shape-cut-sm border border-black/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
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
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-black/10">
            <table className="min-w-full divide-y divide-black/10 text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs font-semibold text-[var(--theme-body-muted)]">
                <tr>
                  <th className="px-3 py-3">학번</th>
                  <th className="px-3 py-3">이름</th>
                  <th className="px-3 py-3">기수</th>
                  <th className="px-3 py-3">전화번호</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 bg-white/50">
                {roster.map((member) => (
                  <tr key={member.id}>
                    {editingId === member.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input value={editForm.studentId} onChange={(e) => setEditForm((p) => ({ ...p, studentId: e.target.value }))} maxLength={10} className={`${inputCls} w-32`} />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} maxLength={20} className={`${inputCls} w-24`} />
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--theme-body-muted)]">자동계산</td>
                        <td className="px-3 py-2 text-xs text-[var(--theme-body-muted)]">{member.phone || '-'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleEditSave(member.id)} disabled={editSaving} className="text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50">저장</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline">취소</button>
                          </div>
                        </td>
                      </>
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

      <div className="rounded-lg border border-black/10 bg-black/5 p-4">
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
          className="mt-3 shape-cut-sm border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '명부 가져오는 중...' : '명부 업로드 (.xlsx / .csv)'}
        </button>

        {result && (
          <p className="mt-3 shape-cut-sm bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
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

function MembersTab({ currentUser }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    let mounted = true
    listMembers()
      .then((data) => { if (mounted) setMembers(data) })
      .catch((err) => { if (mounted) setError(err.message || '회원 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleRoleUpdate = async (member) => {
    const newRole = member.role === 'ADMIN' ? 'USER' : 'ADMIN'
    try {
      const updated = await updateMemberRole(member.id, newRole)
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)))
    } catch (err) {
      alert(err.message || '역할 변경 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`${member.name} 회원을 삭제하시겠습니까?`)) return
    try {
      await deleteMember(member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  if (loading) return <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (members.length === 0) return <p className="text-sm text-[var(--theme-body-muted)]">회원이 없습니다.</p>

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const isSelf = member.studentId === currentUser.studentId
        const isExpanded = expanded === member.id
        const interests = parseInterests(member.interests)
        const hasExtra = member.aspiration || interests.length > 0

        return (
          <div key={member.id} className="shape-cut-sm border border-black/10 bg-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--theme-body-dark)]">{member.name}</span>
                  <span className="text-xs text-[var(--theme-body-muted)]">{member.studentId}</span>
                  {member.role === 'ADMIN' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">관리자</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--theme-body-muted)]">{member.email}{member.phone && ` · ${member.phone}`}</p>
              </div>
              <div className="flex items-center gap-3">
                {hasExtra && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : member.id)}
                    className="text-xs font-semibold text-blue-500 transition hover:underline"
                  >
                    {isExpanded ? '접기' : '상세'}
                  </button>
                )}
                {!isSelf && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRoleUpdate(member)}
                      className="text-xs font-semibold text-blue-500 transition hover:underline"
                    >
                      {member.role === 'ADMIN' ? '일반 회원으로' : '관리자 지정'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member)}
                      className="text-xs font-semibold text-red-500 transition hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && hasExtra && (
              <div className="border-t border-black/10 px-4 py-3 space-y-2 bg-black/3">
                {interests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--theme-body-muted)] uppercase tracking-wide">관심 분야</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {interests.map((item) => (
                        <span key={item} className="rounded bg-black/8 px-2 py-0.5 text-xs font-semibold text-[var(--theme-body-dark)]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {member.aspiration && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--theme-body-muted)] uppercase tracking-wide">포부</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--theme-body-dark)] whitespace-pre-wrap">{member.aspiration}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilesTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const loadFiles = () => {
    listFiles()
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(loadFiles, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadFile(file)
      loadFiles()
    } catch (err) {
      alert(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('파일을 삭제하시겠습니까?')) return
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shape-cut-sm border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '파일 업로드'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 파일이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="shape-cut-sm flex items-center justify-between gap-3 border border-black/10 bg-black/5 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[var(--theme-body-dark)]">{file.originalName}</p>
                <p className="text-xs text-[var(--theme-body-muted)]">
                  {file.uploadedBy} · {formatFileSize(file.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(file.id)}
                className="text-xs font-semibold text-red-500 transition hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '알 수 없음'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
