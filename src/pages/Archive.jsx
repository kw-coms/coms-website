import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileUp, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { createPost, deleteFile, downloadUrl, listFiles } from '../services/archiveApi.js'
import { useAuth } from '../contexts/useAuth.js'

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

function clickableCell(open) {
  return { onClick: open }
}

function WriteForm({ onCancel, onSave }) {
  const [form, setForm] = useState({ title: '', description: '' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!file) { setError('파일을 선택해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = await createPost({ title: form.title.trim(), description: form.description.trim(), file })
      onSave(saved)
    } catch (err) {
      setError(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/10 bg-white/80 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
      <input
        value={form.title}
        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
        maxLength={200}
        placeholder="제목"
        className="w-full rounded border border-black/15 bg-white px-4 py-3 text-sm text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <textarea
        value={form.description}
        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        rows={8}
        maxLength={2000}
        placeholder="설명 (선택)"
        className="w-full resize-y rounded border border-black/15 bg-white px-4 py-3 text-sm leading-7 text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--theme-body-muted)]">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-black/15 bg-white px-3 py-2 font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          <FileUp size={15} />
          파일 선택
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <span className="min-w-0 truncate">{file ? file.name : '선택된 파일 없음'}</span>
      </div>
      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-[var(--theme-text)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
        >
          {saving ? '업로드 중...' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--theme-body-mid)]"
        >
          <X size={14} />
          취소
        </button>
      </div>
    </form>
  )
}

export default function Archive({ onBack }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detailFile, setDetailFile] = useState(null)
  const [mode, setMode] = useState('list')
  const [searchQuery, setSearchQuery] = useState('')

  const isAdmin = user?.role === 'ADMIN'

  const loadFiles = ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    listFiles()
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '자료실 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listFiles()
      .then((data) => { if (mounted) setFiles(Array.isArray(data) ? data : []) })
      .catch((err) => { if (mounted) setError(err.message || '자료실 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    const q = searchQuery.toLowerCase()
    return files.filter((f) =>
      (f.title || f.originalName || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q) ||
      (f.uploaderName || f.uploadedBy || '').toLowerCase().includes(q)
    )
  }, [files, searchQuery])

  const handleDelete = async (id) => {
    if (!window.confirm('자료를 삭제하시겠습니까?')) return
    setError('')
    setNotice('')
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
      if (detailFile?.id === id) {
        setDetailFile(null)
        setMode('list')
      }
      setNotice('자료가 삭제되었습니다.')
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const openFile = (file) => {
    setDetailFile(file)
    setMode('detail')
  }

  const handleSave = (saved) => {
    setFiles((prev) => [saved, ...prev])
    setNotice('자료가 등록되었습니다.')
    setMode('list')
  }

  const backToList = () => {
    setMode('list')
    setDetailFile(null)
  }

  return (
    <div className="w-full space-y-5">
      {mode === 'list' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15"
          >
            메인으로 돌아가기
          </button>
          <div className="text-sm text-white/55">
            {user?.name ? `${user.name}님` : "COM's 자료실"}
          </div>
        </div>
      )}

      <section className="overflow-hidden border border-white/10 bg-white/5 shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/20 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">Archive</p>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
                {mode === 'write' ? '자료 등록' : mode === 'detail' ? '자료 상세' : '자료실'}
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-white/68">
                {mode === 'list' ? '자료를 올리거나 목록에서 선택해 다운로드합니다.' : ''}
              </p>
            </div>
            {mode === 'list' ? (
              <button
                type="button"
                onClick={() => setMode('write')}
                className="shape-cut-sm bg-white/85 px-5 py-2.5 text-sm font-bold text-[var(--theme-body-dark)] transition hover:bg-white"
              >
                자료 올리기
              </button>
            ) : (
              <button
                type="button"
                onClick={backToList}
                className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <ArrowLeft size={15} />
                목록
              </button>
            )}
          </div>
        </div>

        {mode === 'write' && (
          <div className="p-5 sm:p-7">
            <WriteForm onCancel={backToList} onSave={handleSave} />
          </div>
        )}

        {mode === 'list' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/18 px-5 py-3 sm:px-7">
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-3 text-white/45 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="제목, 설명, 작성자 검색"
                  className="shape-cut-sm border border-white/10 bg-black/20 py-2 pl-8 pr-3 text-sm text-white placeholder-white/35 outline-none focus:border-white/25 w-56"
                />
              </div>
              <div className="text-xs font-semibold text-white/45">{filteredFiles.length}개</div>
            </div>

            {notice && (
              <div className="mx-5 mt-5 shape-cut-sm border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 sm:mx-7">
                {notice}
              </div>
            )}

            {error && (
              <div className="mx-5 mt-5 flex flex-col gap-3 shape-cut-sm border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:mx-7 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => loadFiles()}
                  className="inline-flex items-center justify-center gap-2 shape-cut-sm border border-white/10 bg-white/10 px-3 py-2 font-semibold text-white transition hover:bg-white/15"
                >
                  <RefreshCw size={15} />
                  다시 시도
                </button>
              </div>
            )}

            <div className="m-5 overflow-hidden shape-cut-sm border border-white/10 bg-black/18 sm:m-7">
              {loading ? (
                <div className="px-5 py-16 text-center text-white/65">자료를 불러오는 중...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="px-5 py-16 text-center text-white/65">
                  {searchQuery ? '검색 결과가 없습니다.' : '등록된 자료가 없습니다.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-white/8 text-xs uppercase tracking-[0.24em] text-white/45">
                      <tr>
                        <th className="w-16 px-4 py-3 font-semibold">번호</th>
                        <th className="px-4 py-3 font-semibold">제목</th>
                        <th className="w-28 px-4 py-3 font-semibold">크기</th>
                        <th className="w-28 px-4 py-3 font-semibold">작성자</th>
                        <th className="w-36 px-4 py-3 font-semibold">날짜</th>
                        <th className="w-28 px-4 py-3 text-right font-semibold">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredFiles.map((file) => {
                        const open = () => openFile(file)
                        return (
                          <tr
                            key={file.id}
                            tabIndex={0}
                            role="button"
                            onClick={open}
                            onKeyDown={(event) => openRowWithKeyboard(event, open)}
                            className="cursor-pointer text-white/75 transition hover:bg-white/5 focus:bg-white/10 focus:outline-none"
                          >
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-white/45">{file.id}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                              <span className="block max-w-[340px] truncate font-semibold text-white" title={file.title || file.originalName}>
                                {file.title || file.originalName}
                              </span>
                              {file.description && (
                                <span className="mt-0.5 block max-w-[340px] truncate text-xs text-white/45">
                                  {file.description}
                                </span>
                              )}
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{formatSize(file.fileSize)}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{file.uploaderName || file.uploadedBy || '-'}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{formatDate(file.uploadedAt)}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <a
                                  href={downloadUrl(file.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-white/10 bg-white/10 px-3 py-2 font-semibold text-white transition hover:bg-white/15"
                                >
                                  <Download size={15} />
                                  다운로드
                                </a>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {mode === 'detail' && detailFile && (
          <div className="m-5 border border-white/10 bg-black/18 p-5 text-white/80 sm:m-7">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">Archive</p>
              <h2 className="mt-3 break-words text-2xl font-bold text-white">{detailFile.title || detailFile.originalName}</h2>
              <p className="mt-2 text-xs text-white/45">
                {detailFile.uploaderName || detailFile.uploadedBy || '-'} · {formatDate(detailFile.uploadedAt)}
              </p>
            </div>
            {detailFile.description && (
              <div className="border-b border-white/10 py-5">
                <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">{detailFile.description}</p>
              </div>
            )}
            <dl className="grid gap-4 border-b border-white/10 py-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-white/45">파일명</dt>
                <dd className="mt-1 break-all font-semibold text-white">{detailFile.originalName}</dd>
              </div>
              <div>
                <dt className="text-white/45">크기</dt>
                <dd className="mt-1 font-semibold text-white">{formatSize(detailFile.fileSize)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={downloadUrl(detailFile.id)}
                className="shape-cut-sm inline-flex items-center justify-center gap-2 bg-white/85 px-4 py-2 font-semibold text-[var(--theme-body-dark)] transition hover:bg-white"
              >
                <Download size={15} />
                다운로드
              </a>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(detailFile.id)}
                  className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-red-300/20 bg-red-400/10 px-4 py-2 font-semibold text-red-100 transition hover:bg-red-400/20"
                >
                  <Trash2 size={15} />
                  삭제
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
