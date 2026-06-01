import { useEffect, useRef, useState } from 'react'
import { listMembers, updateMemberRole, deleteMember } from '../services/adminApi.js'
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
          {activeTab === 'files' && <FilesTab />}
        </section>
      </div>
    </div>
  )
}

function MembersTab({ currentUser }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        return (
          <div
            key={member.id}
            className="shape-cut-sm flex flex-wrap items-center justify-between gap-3 border border-black/10 bg-black/5 px-4 py-3"
          >
            <div>
              <span className="font-semibold text-[var(--theme-body-dark)]">{member.name}</span>
              <span className="ml-2 text-xs text-[var(--theme-body-muted)]">{member.studentId}</span>
              {member.role === 'ADMIN' && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                  관리자
                </span>
              )}
              <p className="mt-0.5 text-xs text-[var(--theme-body-muted)]">{member.email}</p>
            </div>
            {!isSelf && (
              <div className="flex gap-3">
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
