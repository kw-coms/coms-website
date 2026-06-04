import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { deleteFile, downloadUrl, listFiles, uploadFile } from '../services/archiveApi.js'
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

export default function Archive({ onBack }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [detailFile, setDetailFile] = useState(null)
  const [mode, setMode] = useState('list')
  const fileInputRef = useRef(null)

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
      .then((data) => {
        if (mounted) setFiles(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (mounted) setError(err.message || '자료실 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('업로드할 파일을 선택해주세요.')
      return
    }

    setUploading(true)
    setError('')
    setNotice('')

    try {
      await uploadFile(selectedFile)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNotice('파일이 업로드되었습니다.')
      loadFiles({ showLoading: false })
    } catch (err) {
      setError(err.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('파일을 삭제하시겠습니까?')) return
    setError('')
    setNotice('')

    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((file) => file.id !== id))
      if (detailFile?.id === id) {
        setDetailFile(null)
        setMode('list')
      }
      setNotice('파일이 삭제되었습니다.')
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15"
        >
          메인으로 돌아가기
        </button>
        <div className="text-sm text-white/55">
          {user?.name ? `${user.name}님` : 'COM\'s 자료실'}
        </div>
      </div>

      <section className="overflow-hidden border border-white/10 bg-white/5 shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/20 px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">Archive</p>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">{mode === 'detail' ? '자료 상세' : '자료실'}</h1>
              <p className="mt-3 max-w-2xl leading-7 text-white/68">
                목록에서 자료를 선택해 별도 상세 화면에서 확인하고 다운로드합니다.
              </p>
            </div>

            {mode === 'detail' ? (
              <button
                type="button"
                onClick={() => setMode('list')}
                className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <ArrowLeft size={15} />
                목록
              </button>
            ) : isAdmin && (
              <div className="shape-cut-sm border border-white/10 bg-black/20 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    className="max-w-full text-sm text-white/70 file:mr-3 file:shape-cut-sm file:border-0 file:bg-white/82 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--theme-body-dark)]"
                  />
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="shape-cut-sm inline-flex items-center justify-center gap-2 bg-white/85 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UploadCloud size={16} />
                    {uploading ? '업로드 중...' : '업로드'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
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

        {mode === 'detail' && detailFile ? (
          <div className="m-5 border border-white/10 bg-black/18 p-5 text-white/80 sm:m-7">
            <div className="border-b border-white/10 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">File Detail</p>
              <h2 className="mt-3 break-words text-2xl font-bold text-white">{detailFile.originalName}</h2>
            </div>
            <dl className="grid gap-4 border-b border-white/10 py-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-white/45">크기</dt>
                <dd className="mt-1 font-semibold text-white">{formatSize(detailFile.fileSize)}</dd>
              </div>
              <div>
                <dt className="text-white/45">업로드</dt>
                <dd className="mt-1 font-semibold text-white">{detailFile.uploadedBy || '-'}</dd>
              </div>
              <div>
                <dt className="text-white/45">날짜</dt>
                <dd className="mt-1 font-semibold text-white">{formatDate(detailFile.uploadedAt)}</dd>
              </div>
              <div>
                <dt className="text-white/45">MIME</dt>
                <dd className="mt-1 font-semibold text-white">{detailFile.mimeType || '-'}</dd>
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
        ) : (
        <div className="m-5 overflow-hidden shape-cut-sm border border-white/10 bg-black/18 sm:m-7">
          {loading ? (
            <div className="px-5 py-16 text-center text-white/65">자료를 불러오는 중...</div>
          ) : files.length === 0 ? (
            <div className="px-5 py-16 text-center text-white/65">등록된 자료가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/8 text-xs uppercase tracking-[0.24em] text-white/45">
                  <tr>
                    <th className="px-4 py-3 font-semibold">번호</th>
                    <th className="px-4 py-3 font-semibold">파일명</th>
                    <th className="px-4 py-3 font-semibold">크기</th>
                    <th className="px-4 py-3 font-semibold">업로드</th>
                    <th className="px-4 py-3 font-semibold">날짜</th>
                    <th className="px-4 py-3 text-right font-semibold">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {files.map((file) => (
                    <tr key={file.id} className="text-white/75 transition hover:bg-white/5">
                      <td className="px-4 py-4 text-white/45">{file.id}</td>
                      <td className="max-w-[320px] px-4 py-4 font-semibold text-white">
                        <button
                          type="button"
                          onClick={() => { setDetailFile(file); setMode('detail') }}
                          className="block max-w-full truncate text-left hover:underline"
                          title={file.originalName}
                        >
                          {file.originalName}
                        </button>
                      </td>
                      <td className="px-4 py-4">{formatSize(file.fileSize)}</td>
                      <td className="px-4 py-4">{file.uploadedBy || '-'}</td>
                      <td className="px-4 py-4">{formatDate(file.uploadedAt)}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={downloadUrl(file.id)}
                            className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-white/10 bg-white/10 px-3 py-2 font-semibold text-white transition hover:bg-white/15"
                          >
                            <Download size={15} />
                            다운로드
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </section>
    </div>
  )
}
