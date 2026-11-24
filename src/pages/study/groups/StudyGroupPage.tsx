import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import PageHeading from '../../../components/PageHeading'
import { useAuth } from '../../../contexts/useAuth'
import { usePermissions } from '../../../contexts/usePermissions'
import { checkInToAttendance } from '../../../services/attendanceApi'
import { requestBlob } from '../../../services/apiClient'
import {
  approveStudyGroup, closeStudyAttendance, createStudySession, decideStudyMember, downloadStudyRates,
  endStudyGroup, getStudyGroup, getStudyRates, getStudyRoster, joinStudyGroup, leaveStudyGroup,
  listStudyMaterials, listStudyMembers, listStudySessions, markStudyAttendance, openStudyAttendance,
  removeStudyInterest, removeStudyMember, replaceStudyLeader, saveStudyInterest, startStudyGroup, updateStudyGroup,
  updateStudySession, uploadStudyMaterial, type GroupView, type GroupWrite, type Interest,
  type Material, type Membership, type RateRow, type SessionWrite, type StudySession,
} from '../../../services/studyGroupApi'
import { attendancePercent, interestBars, statusLabel } from './studyGroupHelpers'
import './studyGroups.css'

type Tab = '소개' | '회차/출석' | '자료' | '멤버' | '관리'
const tabs: Tab[] = ['소개', '회차/출석', '자료', '멤버', '관리']
const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일']
const bands = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'] as const
const bandLabels = ['오전', '오후', '저녁', '밤']
const levelLabels = { BEGINNER: '입문', INTERMEDIATE: '중급', ADVANCED: '심화' }
const slotLabel = (slot: string) => { const [day, band] = slot.split('_'); return `${weekdayLabels[weekdays.indexOf(day as typeof weekdays[number])] ?? day}요일 ${bandLabels[bands.indexOf(band as typeof bands[number])] ?? band}` }
const cardClass = 'study-group-panel'

function revealTab(button: HTMLButtonElement | null) {
  const list = button?.parentElement
  if (!button || !list) return
  const left = button.offsetLeft
  const right = left + button.offsetWidth
  if (left < list.scrollLeft) list.scrollLeft = left
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth
}

function useAction(invalidate: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action(); invalidate() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return { busy, error, run }
}

function Button({ children, onClick, disabled, secondary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button type="button" className={secondary ? 'apple-action-secondary' : 'apple-action-primary'} onClick={onClick} disabled={disabled}>{children}</button>
}

function InterestPanel({ group, refresh }: { group: GroupView; refresh: () => void }) {
  const [slots, setSlots] = useState<string[]>(group.myInterest?.slots ?? [])
  const [level, setLevel] = useState<Interest['level']>(group.myInterest?.level)
  const action = useAction(refresh)
  const canRespond = group.status === 'PROPOSED' || group.status === 'RECRUITING'
  const summary = group.interestSummary
  return <section className={cardClass}>
    <h2>수요조사 · 관심 {summary.total}명</h2>
    {canRespond && <>
      <div className="study-group-actions"><Button disabled={action.busy} onClick={() => void action.run(() => saveStudyInterest(group.id, { slots, level }))}>{group.myInterest ? '관심 정보 저장' : '관심 있어요'}</Button>
        {group.myInterest && <Button secondary disabled={action.busy} onClick={() => void action.run(() => removeStudyInterest(group.id))}>관심 취소</Button>}</div>
      <fieldset className="study-group-interest-slots">
        <legend>선호 시간 (여러 개 선택)</legend>
        <div aria-hidden="true"><span />{bandLabels.map(label => <span key={label}>{label}</span>)}</div>
        {weekdays.map((day, index) => <div key={day}>
          <b aria-hidden="true">{weekdayLabels[index]}</b>
          {bands.map(band => {
            const slot = `${day}_${band}`
            const selected = slots.includes(slot)
            return <button key={slot} type="button" aria-label={slotLabel(slot)} aria-pressed={selected}
              onClick={() => setSlots(current => selected ? current.filter(value => value !== slot) : [...current, slot])}>
              {selected && <Check size={18} aria-hidden="true" />}
            </button>
          })}
        </div>)}
      </fieldset>
      <label className="study-group-field">수준 <select value={level ?? ''} onChange={event => setLevel(event.target.value ? event.target.value as Interest['level'] : undefined)}><option value="">선택 안 함</option>{Object.entries(levelLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    </>}
    {action.error && <p role="alert" className="study-group-error">{action.error}</p>}
    <div className="study-group-bars"><h3>관심 수준</h3>{interestBars(summary.levels, summary.total).map(item => <div className="study-group-bar" key={item.key}><span>{levelLabels[item.key as keyof typeof levelLabels] ?? item.key}</span><div><i style={{ width: `${item.width}%` }} /></div><b>{item.count}</b></div>)}
      <h3>선호 시간</h3>{interestBars(summary.slots, summary.total).map(item => <div className="study-group-bar" key={item.key}><span>{slotLabel(item.key)}</span><div><i style={{ width: `${item.width}%` }} /></div><b>{item.count}</b></div>)}
    </div>
    {group.manager && summary.names && summary.names.length > 0 && <details><summary>관심 있는 회원 보기</summary><ul>{summary.names.map(person => <li key={person.studentId}>{person.name}</li>)}</ul></details>}
  </section>
}

function IntroTab({ group, refresh }: { group: GroupView; refresh: () => void }) {
  const { user } = useAuth()
  const action = useAction(refresh)
  const canJoin = user && user.role !== 'ASSOCIATE' && (group.status === 'RECRUITING' || group.status === 'ACTIVE') && !group.myMembership
  return <div className="study-group-stack">
    <section className={cardClass}><h2>모임 소개</h2><p className="study-group-description">{group.description}</p><dl className="study-group-details"><div><dt>주제</dt><dd>{group.topicTags.join(' · ') || '미정'}</dd></div><div><dt>학기</dt><dd>{group.term}</dd></div><div><dt>일정</dt><dd>{group.schedule || '협의 중'}</dd></div><div><dt>장소</dt><dd>{group.place || '협의 중'}</dd></div><div><dt>리더</dt><dd>{group.leaderName}</dd></div><div><dt>정원</dt><dd>{group.capacity ?? '제한 없음'}</dd></div></dl>
      {canJoin && <Button disabled={action.busy} onClick={() => void action.run(() => joinStudyGroup(group.id))}>참여 신청</Button>}
      {group.myMembership?.status === 'PENDING' && <p>참여 승인을 기다리는 중입니다.</p>}
      {group.myMembership?.status === 'APPROVED' && <p>이 스터디에 참여 중입니다.</p>}
      {action.error && <p role="alert" className="study-group-error">{action.error}</p>}
    </section>
    <InterestPanel group={group} refresh={refresh} />
    <div className="study-group-related"><Link to="/meet">모임 날짜 투표</Link><Link to="/gatherings">자유 모임</Link></div>
  </div>
}

function RoundCard({ group, session, canEditRounds, refresh }: { group: GroupView; session: StudySession; canEditRounds: boolean; refresh: () => void }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SessionWrite>({ date: session.date, topic: session.topic, notes: session.notes ?? '' })
  const [code, setCode] = useState('')
  const action = useAction(refresh)
  const rosterQuery = useQuery({ queryKey: ['study', group.id, user?.studentId, 'session', session.id, 'roster'], queryFn: () => getStudyRoster(group.id, session.id), enabled: Boolean(group.manager || group.myMembership?.status === 'APPROVED') })
  const roster = rosterQuery.data ?? []
  const refreshRoster = () => { void rosterQuery.refetch(); refresh() }
  const mark = useAction(refreshRoster)
  const canOpen = canEditRounds && session.date <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await action.run(() => updateStudySession(group.id, session.id, draft)) }
  return <article className={cardClass}>
    <header className="study-group-round-head"><div><h3>{session.roundNo}회 · {session.topic}</h3><p>{session.date}</p></div>{session.attendanceOpen && <span className="study-group-state">출석 진행 중</span>}</header>
    {session.notes && <p className="study-group-description">{session.notes}</p>}
    {group.manager && <div className="study-group-actions">
      {canEditRounds && <Button secondary onClick={() => setEditing(!editing)}>{editing ? '수정 취소' : '회차 수정'}</Button>}
      {!session.attendanceOpen && canOpen && <Button disabled={action.busy} onClick={() => void action.run(() => openStudyAttendance(group.id, session.id, 30))}>출석 열기 (30분)</Button>}
      {session.attendanceOpen && <Button secondary disabled={action.busy} onClick={() => void action.run(() => closeStudyAttendance(group.id, session.id))}>출석 마감</Button>}
    </div>}
    {group.manager && session.attendanceOpen && session.attendanceCode && <p className="study-group-code">출석 코드 <strong>{session.attendanceCode}</strong></p>}
    {canEditRounds && editing && <form className="study-group-form" onSubmit={save}><label>날짜 <input type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label>주제 <input required value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} /></label><label>메모 <textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label><button className="apple-action-primary">저장</button></form>}
    {session.attendanceOpen && group.myMembership?.status === 'APPROVED' && <form className="study-group-checkin" onSubmit={event => { event.preventDefault(); void action.run(() => checkInToAttendance(code).then(refreshRoster)) }}><label>코드 입력 <input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required aria-label="출석 코드" /></label><button className="apple-action-primary" disabled={action.busy}>출석하기</button></form>}
    {action.error && <p role="alert" className="study-group-error">{action.error}</p>}
    {rosterQuery.isPending && <p role="status">출석 명단을 불러오는 중…</p>}
    {rosterQuery.isError && <p role="alert">출석 명단을 불러오지 못했습니다.</p>}
    {rosterQuery.isSuccess && <div className="study-group-roster"><h4>이번 출석 · {roster.filter(row => row.status === 'PRESENT' || row.status === 'LATE').length}명</h4>{roster.map(row => <div key={row.studentId} className="study-group-roster-row"><span>{row.name}</span><span>{row.status === 'PRESENT' ? '출석' : row.status === 'LATE' ? '지각' : row.status === 'ABSENT' ? '결석' : '미기록'}{row.checkedAt ? ` · ${row.checkedAt.slice(11, 16)}` : ''}{row.source === 'MANUAL' && group.manager ? ' · 수동' : ''}</span>{group.manager && row.approvedMember && <select aria-label={`${row.name} 출석 상태`} value={row.status ?? ''} disabled={mark.busy} onChange={event => void mark.run(() => markStudyAttendance(group.id, session.id, row.studentId, event.target.value as 'PRESENT' | 'ABSENT' | 'LATE'))}><option value="" disabled>미기록</option><option value="PRESENT">출석</option><option value="LATE">지각</option><option value="ABSENT">결석</option></select>}</div>)}</div>}
    {mark.error && <p role="alert" className="study-group-error">{mark.error}</p>}
  </article>
}

function RoundsTab({ group, refresh }: { group: GroupView; refresh: () => void }) {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['study', group.id, user?.studentId, 'sessions'], queryFn: () => listStudySessions(group.id), enabled: Boolean(group.manager || group.myMembership?.status === 'APPROVED') })
  const ratesQuery = useQuery({ queryKey: ['study', group.id, user?.studentId, 'rates'], queryFn: () => getStudyRates(group.id), enabled: group.manager })
  const [draft, setDraft] = useState<SessionWrite>({ date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }), topic: '', notes: '' })
  const action = useAction(() => { void query.refetch(); void ratesQuery.refetch(); refresh() })
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await action.run(async () => { await createStudySession(group.id, draft); setDraft({ ...draft, topic: '', notes: '' }) }) }
  async function csv() { await action.run(async () => { const blob = await downloadStudyRates(group.id); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `study-${group.id}-attendance.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }) }
  const canEditRounds = group.manager && (group.status === 'RECRUITING' || group.status === 'ACTIVE')
  if (!group.manager && group.myMembership?.status !== 'APPROVED') return <section className={cardClass}>참여가 승인되면 회차와 출석 명단을 볼 수 있습니다.</section>
  return <div className="study-group-stack">
    {canEditRounds && <form className="study-group-form" onSubmit={create}><h2>회차 만들기</h2><label>날짜 <input type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label>주제 <input required maxLength={120} value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} /></label><label>메모 <textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label><button className="apple-action-primary" disabled={action.busy}>회차 추가</button>{action.error && <p role="alert" className="study-group-error">{action.error}</p>}</form>}
    {query.isPending && <p role="status">회차를 불러오는 중…</p>}{query.isError && <p role="alert">회차를 불러오지 못했습니다. <button onClick={() => void query.refetch()}>다시 시도</button></p>}
    {query.isSuccess && query.data.length === 0 && <section className={cardClass}>아직 등록된 회차가 없습니다.</section>}
    {query.data?.map(session => <RoundCard key={session.id} group={group} session={session} canEditRounds={canEditRounds} refresh={() => { void query.refetch(); void ratesQuery.refetch() }} />)}
    {group.manager && <section className={cardClass}><div className="study-group-split"><h2>멤버별 출석률</h2><Button secondary disabled={action.busy} onClick={() => void csv()}>CSV 다운로드</Button></div>{ratesQuery.isPending && <p role="status">출석률을 불러오는 중…</p>}{ratesQuery.isError && <p role="alert">출석률을 불러오지 못했습니다.</p>}{ratesQuery.data?.map((row: RateRow) => <div className="study-group-rate" key={row.studentId}><span>{row.name}</span><span>{row.attended}/{row.eligible}회 · {attendancePercent(row)}%</span></div>)}</section>}
  </div>
}

function MaterialsTab({ group }: { group: GroupView }) {
  const { user } = useAuth()
  const allowed = group.manager || group.myMembership?.status === 'APPROVED'
  const sessions = useQuery({ queryKey: ['study', group.id, user?.studentId, 'sessions'], queryFn: () => listStudySessions(group.id), enabled: allowed })
  const [round, setRound] = useState(0)
  const query = useQuery({ queryKey: ['study', group.id, user?.studentId, 'materials', round], queryFn: () => listStudyMaterials(group.id, round || undefined), enabled: allowed })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const action = useAction(() => { void query.refetch() })
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (file) await action.run(async () => { await uploadStudyMaterial(group.id, { title, description, file, sessionId: round || undefined }); setTitle(''); setDescription(''); setFile(null); if (fileInput.current) fileInput.current.value = '' }) }
  async function download(item: Material) { await action.run(async () => { const blob = await requestBlob(`/api/files/${item.id}/download`); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = item.originalName || item.title; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }) }
  if (!allowed) return <section className={cardClass}>참여가 승인되면 스터디 자료를 볼 수 있습니다.</section>
  return <div className="study-group-stack"><section className={cardClass}><div className="study-group-split"><h2>스터디 자료</h2><label>회차 <select value={round} onChange={event => setRound(Number(event.target.value))}><option value={0}>전체</option>{sessions.data?.map(session => <option key={session.id} value={session.id}>{session.roundNo}회 · {session.topic}</option>)}</select></label></div>
    {query.isPending && <p role="status">자료를 불러오는 중…</p>}{query.isError && <p role="alert">자료를 불러오지 못했습니다. <button onClick={() => void query.refetch()}>다시 시도</button></p>}{query.isSuccess && query.data.length === 0 && <p>등록된 자료가 없습니다.</p>}
    <ul className="study-group-materials">{query.data?.map(item => <li key={item.id}><div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div><Button secondary disabled={action.busy} onClick={() => void download(item)}>다운로드</Button></li>)}</ul></section>
    <form className="study-group-form" onSubmit={submit}><h2>자료 올리기</h2><label>제목 <input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label><label>설명 <textarea value={description} onChange={event => setDescription(event.target.value)} /></label><label>파일 <input ref={fileInput} type="file" required onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><button className="apple-action-primary" disabled={action.busy || !file}>자료 올리기</button>{action.error && <p role="alert" className="study-group-error">{action.error}</p>}</form>
  </div>
}

function MembersTab({ group, refresh }: { group: GroupView; refresh: () => void }) {
  const { user } = useAuth()
  const { can } = usePermissions()
  const query = useQuery({ queryKey: ['study', group.id, user?.studentId, 'members'], queryFn: () => listStudyMembers(group.id), enabled: Boolean(group.manager || group.myMembership?.status === 'APPROVED') })
  const action = useAction(() => { void query.refetch(); refresh() })
  const [leaderId, setLeaderId] = useState('')
  if (!group.manager && group.myMembership?.status !== 'APPROVED') return <section className={cardClass}>참여가 승인되면 멤버 목록을 볼 수 있습니다.</section>
  return <section className={cardClass}><h2>멤버</h2>{query.isPending && <p role="status">멤버를 불러오는 중…</p>}{query.isError && <p role="alert">멤버 목록을 불러오지 못했습니다.</p>}
    {query.data?.map((member: Membership) => <div className="study-group-member" key={member.studentId}><span><strong>{member.name}</strong> · {member.role === 'LEADER' ? '리더' : member.status === 'PENDING' ? '승인 대기' : '멤버'}</span>{group.manager && member.role !== 'LEADER' && <span className="study-group-actions">{member.status === 'PENDING' && <><Button disabled={action.busy} onClick={() => void action.run(() => decideStudyMember(group.id, member.studentId, true))}>승인</Button><Button secondary disabled={action.busy} onClick={() => void action.run(() => decideStudyMember(group.id, member.studentId, false))}>거절</Button></>}{member.status === 'APPROVED' && <Button secondary disabled={action.busy} onClick={() => void action.run(() => removeStudyMember(group.id, member.studentId))}>내보내기</Button>}</span>}</div>)}
    {can('activity.write') && <form className="study-group-inline" onSubmit={event => { event.preventDefault(); void action.run(() => replaceStudyLeader(group.id, leaderId)) }}><label>리더 바꾸기 <input required list="study-leader-options" value={leaderId} onChange={event => setLeaderId(event.target.value)} placeholder="정회원 학번" /></label><datalist id="study-leader-options">{query.data?.filter(member => member.status === 'APPROVED' && member.role !== 'LEADER').map(member => <option key={member.studentId} value={member.studentId} label={member.name} />)}</datalist><button className="apple-action-secondary" disabled={action.busy || !leaderId}>변경</button></form>}
    {group.myMembership && group.myMembership.studentId === user?.studentId && group.myMembership.role !== 'LEADER' && <Button secondary disabled={action.busy} onClick={() => void action.run(() => leaveStudyGroup(group.id))}>스터디 나가기</Button>}
    {action.error && <p role="alert" className="study-group-error">{action.error}</p>}
  </section>
}

function ManageTab({ group, refresh }: { group: GroupView; refresh: () => void }) {
  const { can } = usePermissions()
  const [draft, setDraft] = useState<GroupWrite>({ name: group.name, description: group.description ?? '', topicTags: group.topicTags, term: group.term, schedule: group.schedule ?? '', place: group.place ?? '', capacity: group.capacity })
  const [tags, setTags] = useState(group.topicTags.join(', '))
  const action = useAction(refresh)
  if (!group.manager) return null
  return <div className="study-group-stack"><form className="study-group-form" onSubmit={event => { event.preventDefault(); void action.run(() => updateStudyGroup(group.id, { ...draft, topicTags: tags.split(',').map(tag => tag.trim()).filter(Boolean) })) }}><h2>스터디 정보 수정</h2><label>이름 <input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>소개 <textarea required value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><label>주제 태그 <input value={tags} onChange={event => setTags(event.target.value)} /></label><label>학기 <input value={draft.term} onChange={event => setDraft({ ...draft, term: event.target.value })} /></label><label>일정 <input value={draft.schedule} onChange={event => setDraft({ ...draft, schedule: event.target.value })} /></label><label>장소 <input value={draft.place} onChange={event => setDraft({ ...draft, place: event.target.value })} /></label><label>정원 <input type="number" min="1" value={draft.capacity ?? ''} onChange={event => setDraft({ ...draft, capacity: event.target.value ? Number(event.target.value) : null })} /></label><button className="apple-action-primary" disabled={action.busy}>정보 저장</button></form>
    <section className={cardClass}><h2>운영 상태</h2><p>현재 {statusLabel(group.status)}</p><div className="study-group-actions">{group.status === 'PROPOSED' && can('activity.write') && <Button disabled={action.busy} onClick={() => void action.run(() => approveStudyGroup(group.id))}>제안 승인 · 모집 시작</Button>}{group.status === 'RECRUITING' && <Button disabled={action.busy} onClick={() => void action.run(() => startStudyGroup(group.id))}>진행 시작</Button>}{group.status !== 'ENDED' && can('activity.write') && <Button secondary disabled={action.busy} onClick={() => void action.run(() => endStudyGroup(group.id))}>스터디 종료</Button>}</div></section>
    {action.error && <p role="alert" className="study-group-error">{action.error}</p>}
  </div>
}

export default function StudyGroupPage() {
  const id = Number(useParams().groupId)
  const tabsId = useId()
  const [tab, setTab] = useState<Tab>('소개')
  const client = useQueryClient()
  const { user } = useAuth()
  const { can } = usePermissions()
  const query = useQuery({ queryKey: ['study', id, user?.studentId], queryFn: () => getStudyGroup(id), enabled: Number.isSafeInteger(id) && id > 0 })
  const visibleTabs = query.data?.manager ? tabs : tabs.slice(0, -1)
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0]
  const activeIndex = visibleTabs.indexOf(activeTab)
  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    let next: number
    switch (event.key) {
      case 'ArrowRight': next = (activeIndex + 1) % visibleTabs.length; break
      case 'ArrowLeft': next = (activeIndex + visibleTabs.length - 1) % visibleTabs.length; break
      case 'Home': next = 0; break
      case 'End': next = visibleTabs.length - 1; break
      default: return
    }
    event.preventDefault()
    event.currentTarget.querySelectorAll('button')[next]?.focus({ preventScroll: true })
    setTab(visibleTabs[next])
  }
  const refresh = () => { void client.invalidateQueries({ queryKey: ['study', id] }); void client.invalidateQueries({ queryKey: ['study-groups'] }) }
  if (!Number.isSafeInteger(id) || id <= 0) return <main className="study-groups-page"><p>스터디 주소가 올바르지 않습니다.</p></main>
  return <main className="study-groups-page"><div className="study-groups-inner"><Link to="/study/groups" className="study-group-back">← 스터디 모임</Link>
    {query.isPending && <p role="status">스터디를 불러오는 중…</p>}{query.isError && <p role="alert">스터디를 불러오지 못했습니다. <button onClick={() => void query.refetch()}>다시 시도</button></p>}
    {query.data && <><header className="study-groups-head"><div><span className="study-group-state">{statusLabel(query.data.status)}</span><PageHeading>{query.data.name}</PageHeading><p>{query.data.topicTags.join(' · ')} · {query.data.schedule || '일정 협의 중'}</p></div></header>
      <div className="study-group-tabs" role="tablist" aria-label="스터디 메뉴" onKeyDown={handleTabKey}>
        {visibleTabs.map((item, index) => <button key={item} id={`${tabsId}-${index}`} type="button" role="tab"
          aria-controls={`${tabsId}-panel`} aria-selected={item === activeTab} tabIndex={item === activeTab ? 0 : -1}
          ref={item === activeTab ? revealTab : undefined} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${activeIndex}`} tabIndex={0}>
        {activeTab === '소개' && <><IntroTab group={query.data} refresh={refresh} />{can('activity.write') && <div className="study-group-related"><Link to="/admin?tab=club-forms&category=STUDY">스터디 설문 양식 관리</Link></div>}</>}
        {activeTab === '회차/출석' && <RoundsTab group={query.data} refresh={refresh} />}
        {activeTab === '자료' && <MaterialsTab group={query.data} />}
        {activeTab === '멤버' && <MembersTab group={query.data} refresh={refresh} />}
        {activeTab === '관리' && <ManageTab group={query.data} refresh={refresh} />}
      </div>
    </>}
  </div></main>
}
