import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PageHeading from '../components/PageHeading'
import { useAuth } from '../contexts/useAuth'
import { deadlineText, FORM_CATEGORIES, getClubForm, isFormCategory, listClubForms, saveClubFormResponse, type Answers, type ClubForm, type Question } from '../services/clubFormApi'
import '../styles/site-pages.css'

const action = 'apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm'
const card = 'rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4 sm:p-5'
const answerOf = (answers: Answers, id: string) => Object.hasOwn(answers, id) ? answers[id] : []
const input = 'mt-2 w-full rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-bg)] px-3 py-2 text-[var(--app-text)]'

function QuestionInput({ question, answers, change }: { question: Question; answers: string[]; change: (values: string[]) => void }) {
  const id = 'club-question-' + question.id
  const label = <>{question.label} {question.required && <span className="text-xs text-[var(--app-muted)]">(필수)</span>}</>
  if (question.kind === 'SHORT' || question.kind === 'LONG') return <label htmlFor={id} className="block text-sm font-semibold">
    {label}
    {question.kind === 'SHORT' ? <input id={id} className={input} required={question.required} maxLength={200} value={answers[0] ?? ''} onChange={e => change([e.target.value])} />
      : <textarea id={id} className={input} rows={4} required={question.required} maxLength={2000} value={answers[0] ?? ''} onChange={e => change([e.target.value])} />}
  </label>
  const one = question.kind === 'SINGLE'
  return <fieldset className="grid gap-2">
    <legend className="mb-2 text-sm font-semibold">{label}</legend>
    {one && !question.required && <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" name={id} checked={!answers.length} onChange={() => change([])} />선택 안 함</label>}
    {question.options.map(option => <label key={option} className="flex min-h-9 items-center gap-2 text-sm">
      <input type={one ? 'radio' : 'checkbox'} name={id} required={one && question.required} checked={answers.includes(option)} onChange={e => change(one ? [option] : e.target.checked ? [...answers, option] : answers.filter(value => value !== option))} />
      {option}
    </label>)}
  </fieldset>
}

function ResponseEditor({ form, submitted, initial, saved }: { form: ClubForm; submitted: boolean; initial: Answers; saved: () => void }) {
  const [answers, setAnswers] = useState(initial)
  const [version] = useState(form.version)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setNotice('')
    const missing = form.questions.find(question => question.required && !answerOf(answers, question.id).some(value => value.trim()))
    if (missing) { setError('필수 질문에 응답해 주세요. ' + missing.label); return }
    setPending(true)
    try {
      const response = await saveClubFormResponse(form.id, version, answers)
      setAnswers(response.answers)
      setNotice('응답을 저장했습니다. 접수 중에는 언제든 수정할 수 있습니다.')
      saved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '응답을 저장하지 못했습니다.') }
    finally { setPending(false) }
  }

  if (!form.open) return <section className={card + ' mt-6'}>
    <h2 className="font-bold">내가 제출한 응답</h2>
    <dl className="mt-4 grid gap-4">{form.questions.map(question => <div key={question.id}><dt className="text-sm font-semibold">{question.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{answerOf(initial, question.id).join('\n') || '응답 없음'}</dd></div>)}</dl>
  </section>
  return <form onSubmit={submit} className={card + ' mt-6 grid gap-4'}>
    <p className="text-sm text-[var(--app-muted)]">응답과 회원 이름·학번은 운영진에게만 전달됩니다.</p>
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <legend className="sr-only">신청·수요조사 응답</legend>
      {form.questions.map(question => <QuestionInput key={question.id} question={question} answers={answerOf(answers, question.id)} change={values => setAnswers(previous => ({ ...previous, [question.id]: values }))} />)}
    </fieldset>
    <button disabled={pending} className="apple-action-primary min-h-11 justify-self-start px-5 text-sm disabled:opacity-50">{pending ? '저장 중…' : submitted ? '응답 수정' : '응답 제출'}</button>
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>
}

function FormDetail({ id, studentId }: { id: number; studentId: string }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['club-forms', 'view', studentId, id], queryFn: () => getClubForm(id), retry: 1 })
  const result = query.data
  return <>
    <Link to="/forms" className="mb-4 inline-block text-sm underline">← 신청·수요조사 목록</Link>
    <PageHeading>{result?.form.title ?? '신청·수요조사'}</PageHeading>
    {query.isPending && <p role="status" className="mt-5">양식을 불러오는 중…</p>}
    {query.isError && <p role="alert" className="mt-5">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>다시 불러오기</button></p>}
    {result && <>
      <p className="mt-4 text-sm font-semibold">{FORM_CATEGORIES[result.form.category]} · {result.form.open ? '접수 중' : '접수 마감'} · {deadlineText(result.form.closesAt)}</p>
      {result.form.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--app-muted)]">{result.form.description}</p>}
      <ResponseEditor key={result.form.id} form={result.form} submitted={Boolean(result.response)} initial={result.response?.answers ?? {}} saved={() => { void client.invalidateQueries({ queryKey: ['club-forms'] }) }} />
    </>}
  </>
}

function FormsList({ studentId }: { studentId: string }) {
  const [params, setParams] = useSearchParams()
  const rawCategory = params.get('category')
  const category = isFormCategory(rawCategory) ? rawCategory : null
  const event = category === 'HACKATHON' ? Number(params.get('event')) || null : null
  const query = useQuery({ queryKey: ['club-forms', 'list', studentId], queryFn: listClubForms, retry: 1 })
  const visible = query.data?.filter(item => (!category || item.category === category)
    && (!event || item.hackathonEventId === null || item.hackathonEventId === event))
  return <>
    <PageHeading>신청·수요조사</PageHeading>
    <p className="mt-3 max-w-xl text-[var(--app-muted)]">해커톤 참가 신청, 팀 프로젝트·스터디 수요조사, 동아리 활동 접수를 모았습니다.</p>
    <label className="mt-5 block max-w-60 text-sm font-semibold">접수 종류<select className={input} value={category ?? ''} onChange={e => setParams(e.target.value ? { category: e.target.value } : {})}><option value="">전체</option>{Object.entries(FORM_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {event && <Link to="/forms?category=HACKATHON" className="mt-2 inline-block text-sm underline">해커톤 양식 전체 보기</Link>}
    {query.isPending && <p role="status" className="mt-5">양식을 불러오는 중…</p>}
    {query.isError && <p role="alert" className="mt-5">양식을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => void query.refetch()}>다시 불러오기</button></p>}
    {visible?.length === 0 && <p className={card + ' mt-6 text-sm'}>이 범위에 접수 중인 양식이나 제출한 응답이 없습니다.</p>}
    <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">{visible?.map(form => <li key={form.id} className={card}>
      <p className="text-xs font-semibold text-[var(--app-accent-text)]">{FORM_CATEGORIES[form.category]} · {form.open ? '접수 중' : '접수 마감'}{form.submitted ? ' · 응답 제출함' : ''}</p>
      <h2 className="mt-2 break-words text-lg font-bold">{form.title}</h2>
      <p className="mt-2 line-clamp-2 break-words text-sm text-[var(--app-muted)]">{form.description}</p>
      <p className="mt-2 text-sm">{deadlineText(form.closesAt)}</p>
      <Link to={'/forms/' + form.id} aria-label={form.title + (form.submitted ? ' 응답 보기' : ' 참여하기')} className={action + ' mt-4'}>{form.submitted ? '응답 보기' : '참여하기'}</Link>
    </li>)}</ul>
  </>
}

export default function ClubForms() {
  const { id: rawId } = useParams()
  const { user } = useAuth()
  const id = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : 0
  if (!user) return null
  return <div className="site-page"><main className="site-page-inner max-w-4xl">
    {rawId === undefined ? <FormsList studentId={user.studentId} /> : Number.isSafeInteger(id) && id > 0
      ? <FormDetail key={user.studentId + ":" + id} id={id} studentId={user.studentId} /> : <><PageHeading>양식을 찾을 수 없습니다.</PageHeading><Link to="/forms" className="mt-3 inline-block underline">신청·수요조사 목록</Link></>}
  </main></div>
}
