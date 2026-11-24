import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { deadlineText, deleteClubForm, FORM_CATEGORIES, getClubFormAggregates, isFormCategory, listAdminClubForms, listClubFormResponses, QUESTION_KINDS, saveClubForm, type ClubForm, type ClubFormWrite, type FormCategory, type Question, type QuestionKind } from '../../services/clubFormApi'
import { listAdminHackathonEvents } from '../../services/hackathonApi'
import { useAuth } from '../../contexts/useAuth'

const action = 'apple-action-secondary inline-flex min-h-10 items-center px-3 text-sm'
const input = 'mt-1 w-full rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-text)]'
const label = 'text-sm font-semibold'
const box = 'rounded-xl border border-[var(--app-hairline)] p-4 sm:p-5'
const isChoice = (kind: QuestionKind) => kind === 'SINGLE' || kind === 'MULTIPLE'
const question = (label = '', kind: QuestionKind = 'SHORT', options: string[] = []): Question => ({ id: crypto.randomUUID(), label, kind, required: true, options })

function initialForm(category: FormCategory, eventId: number | null): ClubFormWrite {
  if (category === 'HACKATHON') return {
    title: '해커톤 팀 참가 신청', description: '팀 대표 한 명이 신청해 주세요.', category, hackathonEventId: eventId,
    accepting: false, closesAt: null, questions: [question('팀 이름'), question('팀원 이름'), question('만들고 싶은 작품이나 주제', 'LONG')],
  }
  if (category === 'TEAM_PROJECT') return {
    title: '팀 프로젝트 수요조사', description: '', category, hackathonEventId: null, accepting: false, closesAt: null,
    questions: [question('팀 프로젝트에 참여하고 싶나요?', 'SINGLE', ['참여 희망', '고민 중', '참여 어려움']), question('관심 있는 분야나 해 보고 싶은 프로젝트', 'LONG')],
  }
  if (category === 'STUDY') return {
    title: '스터디 수요조사', description: '', category, hackathonEventId: null, accepting: false, closesAt: null,
    questions: [question('관심 있는 스터디 주제', 'LONG'), question('참여 의향', 'SINGLE', ['참여 희망', '관심 있음', '참여 어려움'])],
  }
  return { title: '', description: '', category, hackathonEventId: null, accepting: false, closesAt: null, questions: [question()] }
}

function FormEditor({ initial, eventId, category, schemaLocked, studyOnly, onSaved }: {
  initial?: ClubForm; eventId: number | null; category: FormCategory; schemaLocked: boolean; studyOnly: boolean; onSaved: (form: ClubForm) => void
}) {
  const [draft, setDraft] = useState<ClubFormWrite>(() => initial ?? initialForm(category, eventId))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const events = useQuery({ queryKey: ['admin', 'hackathon', 'events'], queryFn: listAdminHackathonEvents, enabled: draft.category === 'HACKATHON' })
  const changeQuestion = (id: string, changes: Partial<Question>) => setDraft(form => ({ ...form, questions: form.questions.map(item => item.id === id ? { ...item, ...changes } : item) }))
  const stale = initial && initial.version !== draft.version
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setPending(true)
    try {
      const payload = { ...draft, questions: draft.questions.map(field => ({ ...field, options: isChoice(field.kind) ? field.options.map(option => option.trim()).filter(Boolean) : [] })) }
      const { title, description, category, hackathonEventId, questions, accepting, closesAt, version } = payload
      const result = await saveClubForm(initial?.id, { title, description, category, hackathonEventId, questions, accepting, closesAt, version })
      onSaved(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '양식을 저장하지 못했습니다.') }
    finally { setPending(false) }
  }
  return <form onSubmit={submit} className={box + ' grid gap-4'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">{initial ? '양식 수정' : '새 양식 만들기'}</h3>
      {!initial && !studyOnly && <div className="flex flex-wrap gap-2">
        <button type="button" className={action} onClick={() => setDraft(initialForm('HACKATHON', eventId))} disabled={pending}>해커톤 신청 양식</button>
        <button type="button" className={action} onClick={() => setDraft(initialForm('TEAM_PROJECT', null))} disabled={pending}>팀프 수요조사 양식</button>
      </div>}
    </div>
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <label className={label}>제목<input className={input} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required maxLength={120} /></label>
      <label className={label}>참여 안내<textarea className={input} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={3000} rows={3} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>접수 종류<select className={input} value={draft.category} disabled={schemaLocked || studyOnly} onChange={e => setDraft({ ...draft, category: e.target.value as FormCategory, hackathonEventId: null })}>{Object.entries(FORM_CATEGORIES).filter(([key]) => !studyOnly || key === 'STUDY').map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className={label}>마감 일시 (한국 시간)<input className={input} type="datetime-local" value={draft.closesAt?.slice(0, 16) ?? ''} onChange={e => setDraft({ ...draft, closesAt: e.target.value || null })} /></label>
      </div>
      {draft.category === 'HACKATHON' && <label className={label}>연결할 해커톤<select className={input} disabled={schemaLocked || !events.data} value={draft.hackathonEventId ?? ''} onChange={e => setDraft({ ...draft, hackathonEventId: Number(e.target.value) || null })}>
        <option value="">해커톤 전체</option>{events.data?.map(event => <option key={event.id} value={event.id}>{event.title}{event.published ? '' : ' · 비공개'}</option>)}
      </select>{events.isError && <span role="alert"> 행사 목록을 불러오지 못했습니다.</span>}</label>}
      {schemaLocked && <p className="text-sm text-[var(--app-muted)]">응답을 받은 양식의 질문과 접수 종류는 고정됩니다.</p>}
      <fieldset disabled={schemaLocked} className="grid min-w-0 gap-3">
        <legend className="mb-2 font-bold">질문 {draft.questions.length}개</legend>
        {draft.questions.map((field, index) => <div key={field.id} className={box + ' grid gap-3'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">질문 {index + 1}</h4>
            {draft.questions.length > 1 && <button type="button" className={action} aria-label={'질문 ' + (index + 1) + ' 삭제'} onClick={() => setDraft({ ...draft, questions: draft.questions.filter(item => item.id !== field.id) })}>삭제</button>}
          </div>
          <label className={label}>질문 내용<input className={input} value={field.label} required maxLength={200} onChange={e => changeQuestion(field.id, { label: e.target.value })} /></label>
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>답변 형식<select className={input} value={field.kind} onChange={e => changeQuestion(field.id, { kind: e.target.value as QuestionKind })}>{Object.entries(QUESTION_KINDS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={e => changeQuestion(field.id, { required: e.target.checked })} />필수 질문</label>
          </div>
          {isChoice(field.kind) && <label className={label}>보기 (한 줄에 하나)<textarea className={input} required rows={4} maxLength={1815} value={field.options.join('\n')} onChange={e => changeQuestion(field.id, { options: e.target.value.split('\n') })} /></label>}
        </div>)}
        {draft.questions.length < 20 && <button type="button" className={action + ' justify-self-start'} onClick={() => setDraft({ ...draft, questions: [...draft.questions, question()] })}>질문 추가</button>}
      </fieldset>
      <label className="flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.accepting} onChange={e => setDraft({ ...draft, accepting: e.target.checked })} />응답 받기</label>
    </fieldset>
    <button disabled={pending || Boolean(stale)} className="apple-action-primary min-h-11 justify-self-start px-4 text-sm disabled:opacity-50">{pending ? '저장 중…' : '양식 저장'}</button>
    {stale && <p role="alert" className="text-sm">양식이 변경되었습니다. 편집을 닫았다가 다시 열어 주세요.</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
  </form>
}

function ResponseList({ form, page, setPage }: { form: ClubForm; page: number; setPage: (value: number) => void }) {
  const { user } = useAuth()
  const results = useQuery({ queryKey: ['admin', 'club-forms', 'responses', user?.studentId, form.id, page], queryFn: () => listClubFormResponses(form.id, page) })
  const aggregates = useQuery({ queryKey: ['admin', 'club-forms', 'aggregates', user?.studentId, form.id], queryFn: () => getClubFormAggregates(form.id) })
  return <section className={box + ' space-y-3'} aria-label={form.title + ' 응답 현황'}>
    <h3 className="font-bold">응답 현황{results.data ? ' · ' + results.data.total + '건' : ''}</h3>
    {aggregates.isPending && <p role="status">전체 응답을 집계하는 중…</p>}
    {aggregates.isError && <p role="alert">집계를 불러오지 못했습니다. <button type="button" className="min-h-11 underline" onClick={() => void aggregates.refetch()}>다시 불러오기</button></p>}
    {aggregates.data && <div className="grid gap-4" aria-label="질문별 전체 응답 집계">{aggregates.data.questions.map(field => <div key={field.id} className={box}>
      <h4 className="break-words text-sm font-bold">{field.label}</h4>
      {isChoice(field.kind) ? <ul className="mt-3 grid list-none gap-3 p-0">{Object.entries(field.counts).map(([option, count]) => {
        const max = Math.max(1, ...Object.values(field.counts))
        return <li key={option} className="text-sm"><div className="flex justify-between gap-2"><span className="break-words">{option}</span><span>{count}명</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--app-hairline)]" aria-hidden="true"><div className="h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${count / max * 100}%` }} /></div>
        </li>
      })}</ul> : <ul className="mt-3 grid list-none gap-2 p-0">{field.answers.length ? field.answers.map((answer, index) => <li key={answer.studentId + ':' + index} className="break-words text-sm"><span className="font-semibold">{answer.name} ({answer.studentId})</span> · <span className="whitespace-pre-wrap">{answer.value}</span></li>) : <li className="text-sm text-[var(--app-muted)]">응답 없음</li>}</ul>}
    </div>)}</div>}
    {results.isPending && <p role="status">응답을 불러오는 중…</p>}
    {results.isError && <p role="alert">응답을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void results.refetch()}>다시 불러오기</button></p>}
    {results.data?.total === 0 && <p className="text-sm">아직 접수된 응답이 없습니다.</p>}
    {results.data?.items.map(row => <details key={row.studentId} className={box}>
      <summary className="cursor-pointer break-words text-sm font-semibold">{row.name} ({row.studentId}) · {new Date(row.submittedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</summary>
      <dl className="mt-3 grid gap-3">{form.questions.map(field => <div key={field.id}><dt className="text-sm font-bold">{field.label}</dt><dd className="whitespace-pre-wrap break-words text-sm text-[var(--app-muted)]">{(Object.hasOwn(row.answers, field.id) ? row.answers[field.id] : []).join('\n') || '응답 없음'}</dd></div>)}</dl>
    </details>)}
    {results.data && (page > 0 || results.data.total > 50) && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={action}>이전</button>
      <span className="self-center text-sm">{page + 1}쪽</span>
      <button type="button" disabled={(page + 1) * 50 >= results.data.total} onClick={() => setPage(page + 1)} className={action}>다음</button>
    </div>}
  </section>
}

export default function AdminClubForms() {
  const { user } = useAuth()
  const studyOnly = user?.role !== 'ADMIN'
  const [params] = useSearchParams()
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'club-forms', 'list', user?.studentId], queryFn: listAdminClubForms, enabled: Boolean(user) })
  const categoryParam = params.get('category')
  const category = studyOnly ? 'STUDY' : isFormCategory(categoryParam) ? categoryParam : 'OTHER'
  const eventParam = Number(params.get('hackathon'))
  const eventId = category === 'HACKATHON' && Number.isSafeInteger(eventParam) && eventParam > 0 ? eventParam : null
  const [selected, setSelected] = useState<number | null>(null)
  const [editor, setEditor] = useState<'new' | 'edit' | null>(categoryParam ? 'new' : null)
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const current = list.data?.find(item => item.id === selected)
  const responses = useQuery({ queryKey: ['admin', 'club-forms', 'responses', user?.studentId, current?.id, 0], queryFn: () => listClubFormResponses(current!.id, 0), enabled: Boolean(current) })
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['admin', 'club-forms'] }), client.invalidateQueries({ queryKey: ['club-forms'] })])
  const saved = (value: ClubForm) => {
    setEditor(null); setSelected(value.id); setPage(0); setError(''); setNotice('양식을 저장했습니다.')
    void refresh()
  }
  const copy = async (form: ClubForm) => {
    try { await navigator.clipboard.writeText(window.location.origin + '/forms/' + form.id); setError(''); setNotice('양식 링크를 복사했습니다.') }
    catch { setNotice(''); setError('복사에 실패했습니다. 양식 열기에서 주소를 복사해 주세요.') }
  }
  const remove = async (form: ClubForm) => {
    if (!await confirmDialog({ title: '양식 삭제', message: form.title + ' 양식을 삭제할까요?', confirmText: '삭제', tone: 'danger' })) return
    setDeleting(true); setNotice(''); setError('')
    try { await deleteClubForm(form.id); setSelected(null); setEditor(null); await refresh(); setNotice('양식을 삭제했습니다.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '양식을 삭제하지 못했습니다.') }
    finally { setDeleting(false) }
  }
  return <section aria-label="신청·수요조사 관리" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">신청·수요조사</h2><p className="mt-2 text-sm text-[var(--app-muted)]">질문과 접수 기간을 정하고, 회원 응답을 확인할 수 있습니다.</p></div>
      <button type="button" className={action} onClick={() => { setEditor(editor === 'new' ? null : 'new'); setNotice(''); setError('') }}>{editor === 'new' ? '작성 닫기' : '새 양식 만들기'}</button>
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    {editor === 'new' && <FormEditor key="new" eventId={eventId} category={category} schemaLocked={false} studyOnly={studyOnly} onSaved={saved} />}
    {list.isPending && <p role="status">양식을 불러오는 중…</p>}
    {list.isError && <p role="alert">양식을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void list.refetch()}>다시 불러오기</button></p>}
    {list.data?.length === 0 && <p className="text-sm">아직 만든 양식이 없습니다.</p>}
    {Boolean(list.data?.length) && <label className={label}>관리할 양식<select className={input} value={selected ?? ''} onChange={e => { setSelected(Number(e.target.value) || null); setPage(0); setEditor(null); setNotice(''); setError('') }}>
      <option value="">선택</option>{list.data?.map(form => <option key={form.id} value={form.id}>{form.title} · {FORM_CATEGORIES[form.category]}</option>)}
    </select></label>}
    {current && editor !== 'new' && <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm">{current.open ? '접수 중' : '접수 닫힘'} · {deadlineText(current.closesAt)}</p>
        <button type="button" className={action} onClick={() => setEditor(editor === 'edit' ? null : 'edit')}>{editor === 'edit' ? '편집 닫기' : '편집'}</button>
        {current.open && <Link to={'/forms/' + current.id} className={action}>양식 열기</Link>}
        <button type="button" className={action} onClick={() => void copy(current)}>링크 복사</button>
        {responses.data?.total === 0 && <button type="button" disabled={deleting} className={action} onClick={() => void remove(current)}>양식 삭제</button>}
      </div>
      {editor === 'edit' && <FormEditor key={current.id} initial={current} eventId={eventId} category={category} schemaLocked={responses.data?.total !== 0} studyOnly={studyOnly} onSaved={saved} />}
      <ResponseList form={current} page={page} setPage={setPage} />
    </div>}
  </section>
}
