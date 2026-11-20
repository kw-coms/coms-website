import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { ListSearch } from '../../components/common/ListTools'
import { showToast } from '../../components/common/Toast'
import {
  generationLabel, IMPORT_ACTION_LABEL, importAction, MAX_IMPORT_ROWS, MAX_LABEL, MAX_NAME, MAX_YEAR, MIN_YEAR,
  parseOfficerPaste, termMatches, type ImportRow, type OfficerRole,
} from '../../features/clubOfficers/clubOfficers'
import { listEligibleMembers } from '../../services/adminApi'
import {
  addOfficer, createTerm, deleteOfficer, deleteTerm, importOfficerRows, linkOfficer, listAdminClubOfficers,
  reorderOfficers, reorderTerms, updateOfficer, updateTerm, type AdminOfficer, type AdminTerm,
} from '../../services/clubOfficerApi'
import { matchesQuery } from '../../utils/listTools'
import '../../styles/officers.css'

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.'
const actionClass = 'apple-action-secondary min-h-11 px-4 text-sm'
const primaryClass = 'apple-action-primary min-h-11 px-5 text-sm disabled:opacity-50'
const ROLE_LABEL: Record<OfficerRole, string> = { PRESIDENT: '회장', VICE_PRESIDENT: '부회장' }
const KEY = ['club-officers']

/** Runs a write. A failure goes to `onError` (inside the form that asked) or, without one, to the top of the panel. */
type Act = (work: () => Promise<unknown>, success: string, onError?: (message: string) => void) => Promise<boolean>

type RosterRow = { id: number; name: string; generation?: string | null; department?: string | null }

/** 명부(회원 관리의 명부 인증과 같은 목록)에서 이름·기수·학과로 찾아 연결한다. */
function RosterPicker({ officer, busy, act, close }: { officer: AdminOfficer; busy: boolean; act: Act; close: () => void }) {
  const [query, setQuery] = useState(officer.name)
  const [pickError, setPickError] = useState('')
  const roster = useQuery({ queryKey: ['club-officers', 'roster'], queryFn: async () => { const data = await listEligibleMembers(); return (Array.isArray(data) ? data : []) as RosterRow[] } })
  const matches = useMemo(() => (roster.data ?? []).filter((row) => query.trim() && matchesQuery(query, [row.name, row.generation, row.generation ? `${row.generation}기` : '', row.department])).slice(0, 8), [roster.data, query])
  return <div className="of-picker" role="group" aria-label={`${officer.name} 명부 연결`}>
    <ListSearch value={query} onChange={setQuery} label={`${officer.name} 명부 검색`} placeholder="이름·기수·학과로 명부 검색" />
    {pickError && <p role="alert" className="of-error">{pickError}</p>}
    {roster.isPending && <p role="status" className="text-sm">명부를 불러오는 중…</p>}
    {roster.isError && <p role="alert" className="of-error">명부를 불러오지 못했습니다.</p>}
    {roster.data && query.trim() && matches.length === 0 && <p className="text-sm text-[var(--app-muted)]">일치하는 명부 항목이 없습니다.</p>}
    {matches.length > 0 && <ul className="of-pick-list" aria-label="명부 검색 결과">{matches.map((row) => <li key={row.id}>
      <span className="min-w-0 break-words text-sm"><strong>{row.name}</strong> <span className="text-[var(--app-muted)]">{[generationLabel(row.generation), row.department].filter(Boolean).join(' · ')}</span></span>
      <button type="button" className="of-text-button" disabled={busy} aria-label={`${row.name} ${generationLabel(row.generation)} 연결`}
        onClick={async () => { if (await act(() => linkOfficer(officer.id, row.id), `${officer.name} 님을 명부와 연결했습니다.`, setPickError)) close() }}>연결</button>
    </li>)}</ul>}
    <button type="button" className={actionClass} onClick={close}>닫기</button>
  </div>
}

function OfficerRow({ officer, index, count, term, busy, act }: { officer: AdminOfficer; index: number; count: number; term: AdminTerm; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [name, setName] = useState(officer.name)
  const [role, setRole] = useState<OfficerRole>(officer.role)
  const [formError, setFormError] = useState('')
  const move = (delta: number) => {
    const ids = term.officers.map((item) => item.id)
    ;[ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]
    return act(() => reorderOfficers(term.id, ids), '순서를 바꿨습니다.')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (await act(() => updateOfficer(officer.id, { role, name: name.trim() }), '임원 정보를 저장했습니다.', setFormError)) setEditing(false)
  }
  const remove = async () => {
    if (await confirmDialog({ title: '임원 삭제', message: `${term.label} ${ROLE_LABEL[officer.role]} ${officer.name} 님을 삭제할까요?`, confirmText: '삭제', tone: 'danger' })) await act(() => deleteOfficer(officer.id), '임원을 삭제했습니다.')
  }
  if (editing) {
    return <li className="of-officer">
      <form onSubmit={save} aria-label={`${officer.name} 임원 편집`} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <label className="text-sm font-semibold">직책<select className="of-input mt-2" value={role} onChange={(event) => setRole(event.target.value as OfficerRole)}><option value="PRESIDENT">회장</option><option value="VICE_PRESIDENT">부회장</option></select></label>
          <label className="text-sm font-semibold">이름<input required maxLength={MAX_NAME} className="of-input mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
        </div>
        {name.trim() !== officer.name && officer.eligibleMemberId && <p className="text-xs text-[var(--app-muted)]">이름을 바꾸면 명부 연결이 풀립니다.</p>}
        {formError && <p role="alert" className="of-error">{formError}</p>}
        <div className="flex flex-wrap gap-2"><button disabled={busy || !name.trim()} className={primaryClass}>저장</button><button type="button" className={actionClass} onClick={() => { setEditing(false); setName(officer.name); setRole(officer.role) }}>취소</button></div>
      </form>
    </li>
  }
  return <li className="of-officer">
    <div className="flex flex-wrap items-center gap-2">
      <span className="of-chip">{ROLE_LABEL[officer.role]}</span>
      <strong className="min-w-0 break-words">{officer.name}</strong>
      {officer.eligibleMemberId
        ? <span className="of-chip" data-tone="accent">{generationLabel(officer.generation) || '기수 없음'} · 명부 연결{officer.eligibleMemberName && officer.eligibleMemberName !== officer.name ? ` (${officer.eligibleMemberName})` : ''}</span>
        : <span className="of-chip">명부 미연결</span>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="of-icon-button" aria-label={`${officer.name} 위로`} disabled={busy || index === 0} onClick={() => move(-1)}><ArrowUp size={16} aria-hidden="true" /></button>
      <button type="button" className="of-icon-button" aria-label={`${officer.name} 아래로`} disabled={busy || index === count - 1} onClick={() => move(1)}><ArrowDown size={16} aria-hidden="true" /></button>
      <button type="button" className={actionClass} onClick={() => setEditing(true)}>{officer.name} 편집</button>
      {officer.eligibleMemberId
        ? <button type="button" className={actionClass} disabled={busy} onClick={() => act(() => linkOfficer(officer.id, null), `${officer.name} 님의 명부 연결을 풀었습니다.`)}>{officer.name} 연결 해제</button>
        : <button type="button" className={actionClass} aria-expanded={linking} onClick={() => setLinking((value) => !value)}>{officer.name} 명부 연결</button>}
      <button type="button" className={`${actionClass} text-[var(--app-danger)]`} disabled={busy} onClick={remove}>{officer.name} 삭제</button>
    </div>
    {linking && !officer.eligibleMemberId && <RosterPicker officer={officer} busy={busy} act={act} close={() => setLinking(false)} />}
  </li>
}

function TermForm({ term, busy, save, cancel }: { term?: AdminTerm; busy: boolean; save: (draft: { label: string; year: number; note: string }, onError: (message: string) => void) => Promise<boolean>; cancel?: () => void }) {
  const [label, setLabel] = useState(term?.label ?? '')
  const [year, setYear] = useState(term ? String(term.year) : String(new Date().getFullYear()))
  const [note, setNote] = useState(term?.note ?? '')
  const [formError, setFormError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    const saved = await save({ label: label.trim(), year: Number(year), note: note.trim() }, setFormError)
    if (saved && !term) { setLabel(''); setNote('') }
  }
  return <form onSubmit={submit} aria-label={term ? `${term.label} 임기 편집` : '임기 추가'} className="grid gap-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">임기 이름<input required maxLength={MAX_LABEL} className="of-input mt-2" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="52대" /></label>
      <label className="text-sm font-semibold">연도<input required type="number" inputMode="numeric" min={MIN_YEAR} max={MAX_YEAR} className="of-input mt-2" value={year} onChange={(event) => setYear(event.target.value)} /></label>
    </div>
    <label className="text-sm font-semibold">메모 (선택)<input maxLength={200} className="of-input mt-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="예: 2학기" /></label>
    {formError && <p role="alert" className="of-error">{formError}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy || !label.trim() || !year} className={primaryClass}>{term ? '임기 저장' : '임기 추가'}</button>{cancel && <button type="button" className={actionClass} onClick={cancel}>취소</button>}</div>
  </form>
}

function OfficerAdd({ term, busy, act }: { term: AdminTerm; busy: boolean; act: Act }) {
  const [role, setRole] = useState<OfficerRole>('PRESIDENT')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (await act(() => addOfficer(term.id, { role, name: name.trim() }), `${name.trim()} 님을 추가했습니다.`, setFormError)) setName('')
  }
  return <form onSubmit={submit} aria-label={`${term.label} 임원 추가`} className="of-add">
    <label className="text-sm font-semibold">직책<select className="of-input mt-2" value={role} onChange={(event) => setRole(event.target.value as OfficerRole)}><option value="PRESIDENT">회장</option><option value="VICE_PRESIDENT">부회장</option></select></label>
    <label className="min-w-0 text-sm font-semibold">이름<input required maxLength={MAX_NAME} className="of-input mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <button disabled={busy || !name.trim()} className={primaryClass}>임원 추가</button>
    {formError && <p role="alert" className="of-error of-add-error">{formError}</p>}
  </form>
}

function TermCard({ term, sameYear, busy, act }: { term: AdminTerm; sameYear: AdminTerm[]; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false)
  // 목록은 같은 해 안에서 나중 임기가 위다. 서버 ids 는 앞선 임기가 먼저(오름차순)다.
  const move = (delta: number) => {
    const shown = sameYear.map((item) => item.id)
    const at = shown.indexOf(term.id)
    ;[shown[at], shown[at + delta]] = [shown[at + delta], shown[at]]
    return act(() => reorderTerms(shown.reverse()), '같은 해 임기 순서를 바꿨습니다.')
  }
  const at = sameYear.findIndex((item) => item.id === term.id)
  const remove = async () => {
    if (await confirmDialog({ title: '임기 삭제', message: `${term.label}(${term.year}년)과 소속 임원 ${term.officers.length}명을 삭제할까요? 복구할 수 없습니다.`, confirmText: '삭제', tone: 'danger' })) await act(() => deleteTerm(term.id), '임기를 삭제했습니다.')
  }
  return <article className="of-admin-term" aria-label={`${term.label} ${term.year}년`}>
    {editing
      ? <TermForm term={term} busy={busy} cancel={() => setEditing(false)} save={async (draft, onError) => { const saved = await act(() => updateTerm(term.id, draft), '임기를 저장했습니다.', onError); if (saved) setEditing(false); return saved }} />
      : <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h4 className="text-lg font-bold"><span className="text-[var(--app-accent-text)]">{term.label}</span> <span className="text-sm font-semibold text-[var(--app-muted)]">{term.year}년{term.note ? ` · ${term.note}` : ''}</span></h4></div>
        <div className="flex flex-wrap gap-2">
          {sameYear.length > 1 && <>
            <button type="button" className="of-icon-button" aria-label={`${term.label} 위로`} disabled={busy || at === 0} onClick={() => move(-1)}><ArrowUp size={16} aria-hidden="true" /></button>
            <button type="button" className="of-icon-button" aria-label={`${term.label} 아래로`} disabled={busy || at === sameYear.length - 1} onClick={() => move(1)}><ArrowDown size={16} aria-hidden="true" /></button>
          </>}
          <button type="button" className={actionClass} onClick={() => setEditing(true)}>{term.label} 편집</button>
          <button type="button" className={`${actionClass} text-[var(--app-danger)]`} disabled={busy} onClick={remove}>{term.label} 삭제</button>
        </div>
      </div>}
    {term.officers.length === 0 && <p className="text-sm text-[var(--app-muted)]">아직 등록된 임원이 없습니다.</p>}
    <ul className="of-officers">{term.officers.map((officer, index) => <OfficerRow key={officer.id} officer={officer} index={index} count={term.officers.length} term={term} busy={busy} act={act} />)}</ul>
    <OfficerAdd term={term} busy={busy} act={act} />
  </article>
}

const PLACEHOLDER = '52대\t2018\t홍길동\t김철수, 이영희\n53대\t2019\t박민수\t'

function BulkPaste({ terms, busy, act }: { terms: AdminTerm[]; busy: boolean; act: Act }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseOfficerPaste> | null>(null)
  const change = (value: string) => { setText(value); setPreview(null) }
  const apply = async () => {
    if (!preview?.rows.length) return
    if (await act(async () => {
      const result = await importOfficerRows(preview.rows)
      showToast(`일괄 등록: 새로 ${result.created}개, 수정 ${result.updated}개, 변경 없음 ${result.unchanged}개`)
    }, '일괄 등록을 마쳤습니다.')) { setText(''); setPreview(null) }
  }
  const tooMany = (preview?.rows.length ?? 0) > MAX_IMPORT_ROWS
  return <section aria-labelledby="of-bulk-title" className="of-card space-y-4">
    <div><h3 id="of-bulk-title" className="text-lg font-bold">한 번에 붙여넣기</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">한 줄에 한 임기: <strong>임기, 연도, 회장, 부회장</strong> 순서로 탭(표 복사) 또는 공백 2칸 이상으로 나눕니다. 한 칸에 여러 명이면 쉼표(,)로 구분하세요. 같은 임기 이름이 이미 있으면 그 임기를 고치고, 이름이 같은 임원의 명부 연결은 그대로 둡니다. 적용 전에 미리보기로 확인합니다.</p></div>
    <label className="block text-sm font-semibold">붙여넣을 내용<textarea rows={6} className="of-input mt-2 font-mono" value={text} onChange={(event) => change(event.target.value)} placeholder={PLACEHOLDER} spellCheck={false} /></label>
    <div className="flex flex-wrap gap-2"><button type="button" className={actionClass} disabled={!text.trim()} onClick={() => setPreview(parseOfficerPaste(text))}>미리보기</button></div>
    {preview && <div className="space-y-3" aria-live="polite">
      {preview.issues.length > 0 && <div role="alert" className="of-issues"><strong>확인이 필요한 줄 {preview.issues.length}개 (이 줄은 적용되지 않습니다)</strong>
        <ul>{preview.issues.map((issue, index) => <li key={index}>{issue.line > 0 ? `${issue.line}번째 줄: ` : ''}{issue.message}{issue.text && <code>{issue.text}</code>}</li>)}</ul></div>}
      {preview.rows.length === 0 && preview.issues.length === 0 && <p className="text-sm text-[var(--app-muted)]">읽을 수 있는 줄이 없습니다.</p>}
      {preview.rows.length > 0 && <div className="of-table" role="region" aria-label="일괄 등록 미리보기" tabIndex={0}><table>
        <thead><tr><th scope="col">임기</th><th scope="col">연도</th><th scope="col">회장</th><th scope="col">부회장</th><th scope="col">처리</th></tr></thead>
        <tbody>{preview.rows.map((row: ImportRow) => {
          const action = importAction(row, terms)
          return <tr key={row.label}><th scope="row">{row.label}</th><td>{row.year}</td><td>{row.presidents.join(', ') || '—'}</td><td>{row.vices.join(', ') || '—'}</td><td><span className="of-chip" data-tone={action === 'same' ? undefined : 'accent'}>{IMPORT_ACTION_LABEL[action]}</span></td></tr>
        })}</tbody></table></div>}
      {preview.rows.length > 0 && <div className="flex flex-wrap items-center gap-3"><button type="button" className={primaryClass} disabled={busy || tooMany} onClick={apply}>{preview.rows.length}개 임기 적용</button>
        <span className="text-sm text-[var(--app-muted)]">새로 {preview.rows.filter((row: ImportRow) => importAction(row, terms) === 'create').length}개 · 수정 {preview.rows.filter((row: ImportRow) => importAction(row, terms) === 'update').length}개</span></div>}
    </div>}
  </section>
}

export default function AdminClubOfficers() {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const terms = useQuery({ queryKey: ['club-officers', 'admin'], queryFn: listAdminClubOfficers })
  const act: Act = async (work, success, onError) => {
    if (pending) return false
    setPending(true); setError(''); setMessage('')
    try {
      await work()
      await client.invalidateQueries({ queryKey: KEY })
      setMessage(success)
      return true
    } catch (cause) { (onError ?? setError)(errorText(cause)); return false } finally { setPending(false) }
  }
  const visible = useMemo(() => (terms.data ?? []).filter((term) => termMatches(query, term)), [terms.data, query])
  if (terms.isPending) return <p role="status">회장단 목록을 불러오는 중…</p>
  if (terms.isError) return <div role="alert">회장단 목록을 불러오지 못했습니다. <button className={actionClass} onClick={() => terms.refetch()}>다시 불러오기</button></div>
  return <section className="space-y-6" aria-label="역대 회장단 관리">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">역대 회장단 관리</h2><p className="mt-2 text-sm text-[var(--app-muted)]">임기(대)와 회장·부회장을 관리하고, 명부와 연결해 기수를 보여 줍니다. 총 {terms.data.length}개 임기.</p></div>
      <Link to="/officers" className={actionClass}>회원용 페이지</Link>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    <BulkPaste terms={terms.data} busy={pending} act={act} />
    <section aria-labelledby="of-terms-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="of-terms-title" className="text-lg font-bold">임기 목록</h3>
        <button type="button" className={actionClass} onClick={() => setCreating((value) => !value)}>{creating ? '작성 닫기' : '임기 추가'}</button>
      </div>
      {creating && <div className="of-card"><TermForm busy={pending} save={(draft, onError) => act(() => createTerm(draft), '임기를 추가했습니다.', onError)} /></div>}
      <div className="flex"><ListSearch value={query} onChange={setQuery} label="임기 검색" placeholder="이름·연도·임기로 검색" /></div>
      {terms.data.length === 0 && <p className="of-card text-sm">아직 임기가 없습니다. 위에서 붙여넣거나 임기를 추가하세요.</p>}
      {terms.data.length > 0 && visible.length === 0 && <p className="text-sm text-[var(--app-muted)]">검색 결과가 없습니다.</p>}
      {visible.map((term) => <TermCard key={term.id} term={term} sameYear={visible.filter((item) => item.year === term.year)} busy={pending} act={act} />)}
    </section>
  </section>
}
