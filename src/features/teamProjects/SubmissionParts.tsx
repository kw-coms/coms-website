import { useState, type FormEvent } from 'react'
import { Paperclip, Plus, X } from 'lucide-react'
import { apiUrl } from '../../services/apiClient'
import type { Submission, SubmissionDraft, SubmissionTiming } from '../../services/teamProjectApi'
import { formatBytes, formatWhen, megabytes, STATUS_LABEL, submissionStatusLabel } from './teamProjects'

export function StatusChip({ status, timing }: { status: keyof typeof STATUS_LABEL; timing?: SubmissionTiming | null }) {
  return <span className="tp-chip" data-status={status}>{submissionStatusLabel(status, timing)}</span>
}

/** A submission as read-only text: who sent it and when, the body, links, and files as attachments. */
export function SubmissionView({ submission }: { submission: Submission }) {
  const edited = submission.updatedAt !== submission.submittedAt
  return <div className="space-y-3">
    <p className="text-xs leading-6 text-[var(--app-muted)]">
      {submission.submittedByName} 제출 · {formatWhen(submission.submittedAt)}
      {edited && <> · {submission.updatedByName} 수정 {formatWhen(submission.updatedAt)}</>}
      {submission.editedAfterDue && !submission.late && <> · 마감 후 수정</>}
    </p>
    {submission.body && <p className="whitespace-pre-wrap break-words text-sm leading-7">{submission.body}</p>}
    {submission.links.length > 0 && <ul className="space-y-1 text-sm">
      {submission.links.map(link => <li key={link} className="break-all"><a href={link} target="_blank" rel="noreferrer noopener" className="text-[var(--app-accent-text)] underline">{link}</a></li>)}
    </ul>}
    {submission.files.length > 0 && <ul className="flex flex-wrap gap-2">
      {submission.files.map(file => <li key={file.id}>
        <a href={apiUrl(file.downloadUrl)} download className="tp-file"><Paperclip size={14} aria-hidden="true" /><span className="min-w-0 truncate">{file.originalName}</span><small>{formatBytes(file.fileSize)}</small></a>
      </li>)}
    </ul>}
  </div>
}

type EditorProps = {
  title: string
  submission?: Submission
  busy: boolean
  /** 0..1 while the request body is being sent, null otherwise. */
  progress: number | null
  limits: { maxFileBytes: number; maxRequestBytes: number }
  onSave: (draft: SubmissionDraft) => Promise<boolean>
  onCancelUpload: () => void
  onDelete?: () => void
}

const fileKey = (file: File) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`

/** Text, any number of links, any number of files of any type. New files are added; existing ones can be taken off. */
export function SubmissionEditor({ title, submission, busy, progress, limits, onSave, onCancelUpload, onDelete }: EditorProps) {
  const [body, setBody] = useState(submission?.body ?? '')
  const [links, setLinks] = useState<string[]>(submission?.links.length ? submission.links : [''])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removeFileIds, setRemoveFileIds] = useState<number[]>([])
  const [pickerKey, setPickerKey] = useState(0)
  const [pickNotice, setPickNotice] = useState('')
  const keptFiles = (submission?.files ?? []).filter(file => !removeFileIds.includes(file.id))
  const cleanLinks = links.map(link => link.trim()).filter(Boolean)
  const empty = !body.trim() && cleanLinks.length === 0 && newFiles.length === 0 && keptFiles.length === 0
  const pick = (picked: File[]) => {
    const notices: string[] = []
    const next = [...newFiles]
    let total = next.reduce((sum, file) => sum + file.size, 0)
    for (const file of picked) {
      if (next.some(existing => fileKey(existing) === fileKey(file))) { notices.push(`${file.name}은(는) 이미 선택했습니다.`); continue }
      if (file.size > limits.maxFileBytes) { notices.push(`${file.name}(${formatBytes(file.size)})은(는) 파일 하나당 최대 ${megabytes(limits.maxFileBytes)}MB를 넘어 올릴 수 없습니다.`); continue }
      if (total + file.size > limits.maxRequestBytes) { notices.push(`${file.name}을(를) 더하면 한 번에 올릴 수 있는 전체 크기(${megabytes(limits.maxRequestBytes)}MB)를 넘습니다. 나눠서 저장해 주세요.`); continue }
      next.push(file)
      total += file.size
    }
    setNewFiles(next)
    setPickNotice(notices.join(' '))
    setPickerKey(key => key + 1)   // an <input type=file> keeps its selection; reset so the same file can be picked again later
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onSave({ body, links: cleanLinks, newFiles, removeFileIds })) { setNewFiles([]); setRemoveFileIds([]); setPickNotice(''); setPickerKey(key => key + 1) }
  }
  return <form onSubmit={submit} aria-label={`${title} 제출`} className="space-y-4">
    <label className="block text-sm font-semibold">내용
      <textarea className="tp-input mt-2" rows={5} maxLength={20000} value={body} onChange={event => setBody(event.target.value)} placeholder="주제, 계획, 진행 상황 등 자유롭게 적어 주세요." />
    </label>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">링크</legend>
      {links.map((link, index) => <div key={index} className="flex gap-2">
        <input type="url" inputMode="url" className="tp-input" aria-label={`링크 ${index + 1}`} value={link} placeholder="https://github.com/…" maxLength={2000} onChange={event => setLinks(links.map((item, at) => at === index ? event.target.value : item))} />
        <button type="button" className="tp-icon-button" aria-label={`링크 ${index + 1} 지우기`} onClick={() => setLinks(links.length > 1 ? links.filter((_, at) => at !== index) : [''])}><X size={16} aria-hidden="true" /></button>
      </div>)}
      <button type="button" className="tp-text-button" onClick={() => setLinks([...links, ''])}><Plus size={14} aria-hidden="true" /> 링크 추가</button>
    </fieldset>
    <div className="space-y-2"><span className="text-sm font-semibold">파일</span>
      {(submission?.files ?? []).length > 0 && <ul className="space-y-1">
        {submission!.files.map(file => {
          const removed = removeFileIds.includes(file.id)
          return <li key={file.id} className="tp-file-row" data-removed={removed || undefined}>
            <Paperclip size={14} aria-hidden="true" />
            <span className="tp-file-name min-w-0 flex-1 truncate">{file.originalName} <small className="text-[var(--app-muted)]">{formatBytes(file.fileSize)}</small></span>
            {removed && <span className="tp-chip" data-tone="warn">저장 시 삭제</span>}
            <button type="button" className="tp-text-button" aria-label={`${file.originalName} ${removed ? '삭제 취소' : '빼기'}`} onClick={() => setRemoveFileIds(removed ? removeFileIds.filter(id => id !== file.id) : [...removeFileIds, file.id])}>{removed ? '되돌리기' : '빼기'}</button>
          </li>
        })}
      </ul>}
      <input key={pickerKey} type="file" multiple aria-label="파일 추가" className="tp-input" onChange={event => pick(Array.from(event.target.files ?? []))} />
      {pickNotice && <p role="alert" className="text-sm text-[var(--app-danger)]">{pickNotice}</p>}
      {newFiles.length > 0 && <ul className="space-y-1">
        {newFiles.map(file => <li key={fileKey(file)} className="tp-file-row"><Paperclip size={14} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{file.name} <small className="text-[var(--app-muted)]">{formatBytes(file.size)} · 새 파일</small></span>
          <button type="button" className="tp-text-button" aria-label={`${file.name} 선택 취소`} onClick={() => setNewFiles(newFiles.filter(item => item !== file))}>취소</button></li>)}
      </ul>}
      <p className="text-xs text-[var(--app-muted)]">형식과 개수는 제한이 없습니다. 파일 하나는 최대 {megabytes(limits.maxFileBytes)}MB, 한 번에 저장하는 전체는 {megabytes(limits.maxRequestBytes)}MB까지입니다.</p>
    </div>
    {busy && progress !== null && newFiles.length > 0 && <div className="flex items-center gap-3" role="status">
      <progress className="tp-progress" max={1} value={progress} aria-label="업로드 진행률" />
      <span className="text-sm tabular-nums">{Math.round(progress * 100)}%</span>
      <button type="button" className="tp-text-button" onClick={onCancelUpload}>업로드 취소</button>
    </div>}
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || empty} className="apple-action-primary min-h-11 px-5 text-sm disabled:opacity-50">{busy ? '저장 중…' : submission ? '수정 저장' : '제출하기'}</button>
      {submission && onDelete && <button type="button" disabled={busy} onClick={onDelete} className="apple-action-secondary min-h-11 px-4 text-sm text-[var(--app-danger)]">제출 삭제</button>}
    </div>
  </form>
}
