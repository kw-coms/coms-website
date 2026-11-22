import { useState } from 'react'
import type { HackathonWorkWrite } from '../../services/hackathonApi'

const introTemplate = '만든 이유\n\n주요 기능\n\n사용한 기술과 팀원 역할\n\n시연 방법\n'

export default function WorkFields({ value, onChange, required = false }: {
  value: HackathonWorkWrite
  onChange: (value: HackathonWorkWrite) => void
  required?: boolean
}) {
  const [preview, setPreview] = useState(false)
  const input = 'hackathon-input mt-2'
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">작품 이름<input required={required} maxLength={120} className={input} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></label>
      <label className="text-sm font-semibold">작성자<input required={required} maxLength={200} className={input} value={value.author} onChange={e => onChange({ ...value, author: e.target.value })} placeholder="공개할 작성자 이름" /></label>
    </div>
    <label className="text-sm font-semibold">작품 소개<textarea required={required} maxLength={5000} rows={7} className={input} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} placeholder="무엇을 만들었고 어떻게 사용하나요?" /></label>
    <div className="flex flex-wrap items-center gap-3">
      {!value.description.trim() && <button type="button" className="apple-action-secondary min-h-10 px-3 text-sm" onClick={() => onChange({ ...value, description: introTemplate })}>소개 양식 넣기</button>}
      <button type="button" className="apple-action-secondary min-h-10 px-3 text-sm" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? '미리보기 닫기' : '미리보기'}</button>
      <span className="text-xs text-[var(--app-muted)]">{value.description.length.toLocaleString('ko-KR')} / 5,000자</span>
    </div>
    {preview && <section aria-label="작품 미리보기" className="rounded-lg bg-[var(--app-surface-soft)] p-4">
      <h4 className="break-words text-lg font-bold">{value.title.trim() || '작품 이름'}</h4>
      {value.author.trim() && <p className="mt-1 text-sm text-[var(--app-muted)]">작성자 · {value.author}</p>}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{value.description || '여기에 작품 소개가 표시됩니다.'}</p>
    </section>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">GitHub 주소<input type="url" pattern="https?://.+" maxLength={2000} className={input} value={value.github ?? ''} onChange={e => onChange({ ...value, github: e.target.value || null })} placeholder="https://" /></label>
      <label className="text-sm font-semibold">체험 주소<input type="url" pattern="https?://.+" maxLength={2000} className={input} value={value.live ?? ''} onChange={e => onChange({ ...value, live: e.target.value || null })} placeholder="https://" /></label>
    </div>
  </>
}
