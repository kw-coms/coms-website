import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeading from '../../../components/PageHeading'
import { useAuth } from '../../../contexts/useAuth'
import { usePermissions } from '../../../contexts/usePermissions'
import { createStudyGroup, listStudyGroups, type GroupWrite } from '../../../services/studyGroupApi'
import { groupCounts, GROUPS_KEY } from './studyGroupHelpers'
import { GroupCards } from './StudyGroupCards'
import './studyGroups.css'

const emptyForm: GroupWrite = { name: '', description: '', topicTags: [], term: '', schedule: '', place: '', capacity: null }

function ProposalForm({ onCreated, onCancel, direct }: { onCreated: (id: number) => void; onCancel: () => void; direct: boolean }) {
  const { user } = useAuth()
  const [value, setValue] = useState<GroupWrite>(emptyForm)
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true); setError('')
    try {
      const result = await createStudyGroup({ ...value, topicTags: tags.split(',').map(tag => tag.trim()).filter(Boolean) }, direct)
      onCreated(result.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '스터디를 저장하지 못했습니다.') }
    finally { setPending(false) }
  }
  return <form className="study-group-form" onSubmit={submit}>
    <h2>{direct ? '스터디 바로 만들기' : '스터디 제안하기'}</h2>
    <label>이름 <input required maxLength={100} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} placeholder="예: 웹 개발 스터디" /></label>
    <label>소개 <textarea required maxLength={3000} rows={3} value={value.description} onChange={event => setValue({ ...value, description: event.target.value })} /></label>
    <label>주제 태그 <input maxLength={200} value={tags} onChange={event => setTags(event.target.value)} placeholder="React, 프론트엔드" /><small>쉼표로 구분해 주세요.</small></label>
    <div className="study-group-form-pair">
      <label>학기 <input value={value.term} onChange={event => setValue({ ...value, term: event.target.value })} placeholder="2026 2학기" /></label>
      <label>일정 <input value={value.schedule} onChange={event => setValue({ ...value, schedule: event.target.value })} placeholder="매주 화 19:00" /></label>
    </div>
    <div className="study-group-form-pair">
      <label>장소 또는 온라인 <input value={value.place} onChange={event => setValue({ ...value, place: event.target.value })} placeholder="동아리방 / 온라인" /></label>
      <label>정원 <input type="number" min="1" value={value.capacity ?? ''} onChange={event => setValue({ ...value, capacity: event.target.value ? Number(event.target.value) : null })} placeholder="제한 없음" /></label>
    </div>
    {direct && <label>리더 학번 <input required={user?.role === 'ASSOCIATE'} value={value.leaderStudentId ?? ''} onChange={event => setValue({ ...value, leaderStudentId: event.target.value })} placeholder={user?.role === 'ASSOCIATE' ? '정회원 학번 입력' : '비워 두면 본인'} /><small>정회원만 리더가 될 수 있습니다.</small></label>}
    {error && <p role="alert" className="study-group-error">{error}</p>}
    <div className="study-group-actions"><button disabled={pending} className="apple-action-primary" type="submit">{pending ? '저장 중…' : direct ? '모임 만들기' : '제안 등록'}</button><button className="apple-action-secondary" type="button" onClick={onCancel}>취소</button></div>
  </form>
}

export default function StudyGroupsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { can } = usePermissions()
  const [sort, setSort] = useState('')
  const [creating, setCreating] = useState(params.has('propose'))
  const [direct, setDirect] = useState(false)
  const query = useQuery({ queryKey: [...GROUPS_KEY, user?.studentId, sort], queryFn: () => listStudyGroups(sort) })
  const groups = query.data ?? []
  const counts = groupCounts(groups)
  const eligible = user && (user.role !== 'ASSOCIATE' || can('activity.write'))
  function onCreated(id: number) {
    void queryClient.invalidateQueries({ queryKey: GROUPS_KEY })
    navigate(`/study/groups/${id}`)
  }
  return <main className="study-groups-page">
    <div className="study-groups-inner">
      <Link to="/study" className="study-group-back">← 스터디 자료</Link>
      <div className="study-groups-head"><div><PageHeading>스터디 모임</PageHeading><p>같이 배우고, 회차마다 출석과 자료를 모아 보세요.</p></div>
        {eligible && <div className="study-group-actions">{user.role !== 'ASSOCIATE' && <button className="apple-action-primary" onClick={() => { setDirect(false); setCreating(true) }}>스터디 제안하기</button>}{can('activity.write') && <button className="apple-action-secondary" onClick={() => { setDirect(true); setCreating(true) }}>바로 만들기</button>}</div>}
      </div>
      {creating && eligible && (direct || user.role !== 'ASSOCIATE') && <ProposalForm direct={direct} onCancel={() => setCreating(false)} onCreated={onCreated} />}
      {!user && <p className="study-group-note">모집 중인 스터디에 참여하려면 <Link to="/login">로그인</Link>해 주세요.</p>}
      <div className="study-group-counts"><span>진행 중 {counts.ACTIVE}</span><span>모집 중 {counts.RECRUITING}</span>{user && <span>제안 {counts.PROPOSED}</span>}</div>
      {user && <label className="study-group-sort">정렬 <select value={sort} onChange={event => setSort(event.target.value)}><option value="">최근순</option><option value="interest">관심 많은 순</option></select></label>}
      {query.isPending && <p role="status">스터디를 불러오는 중…</p>}
      {query.isError && <p role="alert">스터디 목록을 불러오지 못했습니다. <button className="study-group-link-button" onClick={() => void query.refetch()}>다시 시도</button></p>}
      {query.isSuccess && groups.length === 0 && <p>아직 스터디 모임이 없습니다.</p>}
      <GroupCards groups={groups} />
      <div className="study-group-related"><Link to="/gatherings">자유 모임 보기</Link><Link to="/meet">모임 일정 투표 보기</Link></div>
    </div>
  </main>
}
