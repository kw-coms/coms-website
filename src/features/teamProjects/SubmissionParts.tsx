import { useState, type FormEvent } from 'react'
import { Paperclip, Plus, X } from 'lucide-react'
import { apiUrl } from '../../services/apiClient'
import type { Submission, SubmissionDraft } from '../../services/teamProjectApi'
import { formatBytes, formatWhen, STATUS_LABEL } from './teamProjects'

export function StatusChip({ status }: { status: keyof typeof STATUS_LABEL }) {
  return <span className="tp-chip" data-status={status}>{STATUS_LABEL[status]}</span>
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
  onSave: (draft: SubmissionDraft) => Promise<boolean>
  onDelete?: () => void
}

/** Text, any number of links, any number of files of any type. New files are added; existing ones can be taken off. */
export function SubmissionEditor({ title, submission, busy, onSave, onDelete }: EditorProps) {
  const [body, setBody] = useState(submission?.body ?? '')
  const [links, setLinks] = useState<string[]>(submission?.links.length ? submission.links : [''])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removeFileIds, setRemoveFileIds] = useState<number[]>([])
  const [pickerKey, setPickerKey] = useState(0)
  const keptFiles = (submission?.files ?? []).filter(file => !removeFileIds.includes(file.id))
  const cleanLinks = links.map(link => link.trim()).filter(Boolean)
  const empty = !body.trim() && cleanLinks.length === 0 && newFiles.length === 0 && keptFiles.length === 0
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onSave({ body, links: cleanLinks, newFiles, removeFileIds })) { setNewFiles([]); setRemoveFileIds([]); setPickerKey(key => key + 1) }
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
        {submission!.files.map(file => <li key={file.id} className="flex items-center gap-2 text-sm" data-removed={removeFileIds.includes(file.id) || undefined}>
          <Paperclip size={14} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{file.originalName} <small className="text-[var(--app-muted)]">{formatBytes(file.fileSize)}</small></span>
          <button type="button" className="tp-text-button" onClick={() => setRemoveFileIds(removeFileIds.includes(file.id) ? removeFileIds.filter(id => id !== file.id) : [...removeFileIds, file.id])}>{removeFileIds.includes(file.id) ? '되돌리기' : '빼기'}</button>
        </li>)}
      </ul>}
      <input key={pickerKey} type="file" multiple aria-label="파일 추가" className="tp-input" onChange={event => setNewFiles([...newFiles, ...Array.from(event.target.files ?? [])])} />
      {newFiles.length > 0 && <ul className="space-y-1">
        {newFiles.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm"><Paperclip size={14} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{file.name} <small className="text-[var(--app-muted)]">{formatBytes(file.size)} · 새 파일</small></span>
          <button type="button" className="tp-text-button" onClick={() => setNewFiles(newFiles.filter((_, at) => at !== index))}>취소</button></li>)}
      </ul>}
      <p className="text-xs text-[var(--app-muted)]">형식과 개수는 제한이 없습니다. 파일 하나의 최대 크기는 서버 업로드 한도를 따릅니다.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || empty} className="apple-action-primary min-h-11 px-5 text-sm disabled:opacity-50">{busy ? '저장 중…' : submission ? '수정 저장' : '제출하기'}</button>
      {submission && onDelete && <button type="button" disabled={busy} onClick={onDelete} className="apple-action-secondary min-h-11 px-4 text-sm text-[var(--app-danger)]">제출 삭제</button>}
    </div>
  </form>
}
