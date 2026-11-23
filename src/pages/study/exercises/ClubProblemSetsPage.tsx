import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Plus, Trash2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { requestJudgeClub, type ClubSetView } from './clubApi'
import { numberedProblemPath } from './problemNumbers'
import { useNumberedCatalog } from './useNumberedCatalog'
import './club-social.css'

type Draft = { id?: string; title: string; problemNumbers: number[]; shared: boolean }
const empty = (): Draft => ({ title: '', problemNumbers: [], shared: false })
const fromSet = (set: ClubSetView): Draft => ({ id: set.id, title: set.title, problemNumbers: [...set.problemNumbers], shared: set.shared })

function ProblemSetsBody() {
  const catalog = useNumberedCatalog()
  const [search] = useSearchParams()
  const suggestedNumber = Number(search.get('problem'))
  const suggestedExists = catalog.some(({ number }) => number === suggestedNumber)
  const [sets, setSets] = useState<ClubSetView[]>([])
  const [opened, setOpened] = useState<ClubSetView | null>(null)
  const [draft, setDraft] = useState<Draft>(empty)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const requestedSet = search.get('set')
    void Promise.all([
      requestJudgeClub<{ sets: ClubSetView[] }>({ action: 'sets-list' }, controller.signal)
        .then(({ sets: ownSets }) => { if (!controller.signal.aborted) setSets(ownSets) }),
      requestedSet ? requestJudgeClub<{ set: ClubSetView }>({ action: 'sets-open', id: requestedSet }, controller.signal) : Promise.resolve(null),
    ]).then(([, requested]) => {
      if (controller.signal.aborted) return
      if (requested) { setOpened(requested.set); setDraft(fromSet(requested.set)) }
      else if (suggestedExists) {
        setDraft({ ...empty(), problemNumbers: [suggestedNumber] })
      }
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '문제집을 불러오지 못했어요.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, retry, suggestedNumber, suggestedExists])

  const open = async (id: string) => {
    setLoading(true)
    setError('')
    try {
      const { set } = await requestJudgeClub<{ set: ClubSetView }>({ action: 'sets-open', id })
      const next = fromSet(set)
      const canAddSuggested = suggestedExists && !next.problemNumbers.includes(suggestedNumber)
      if (set.owned && canAddSuggested && next.problemNumbers.length < 40) {
        next.problemNumbers.push(suggestedNumber)
        setMessage(`${suggestedNumber}번 문제를 담았습니다. 저장하면 반영됩니다.`)
      } else {
        setMessage('')
      }
      setOpened(set)
      setDraft(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '문제집을 열지 못했어요.')
    } finally { setLoading(false) }
  }

  const add = () => {
    const number = Number(input)
    if (!/^[1-9]\d*$/.test(input.trim()) || !catalog.some((entry) => entry.number === number)) {
      setError('등록된 문제 번호를 입력해 주세요.')
      return
    }
    if (draft.problemNumbers.includes(number)) { setError('이미 담긴 문제예요.'); return }
    if (draft.problemNumbers.length >= 40) { setError('문제집 하나에는 40문제까지 담을 수 있어요.'); return }
    setDraft({ ...draft, problemNumbers: [...draft.problemNumbers, number] })
    setInput('')
    setError('')
  }

  const save = async (copy = false) => {
    const title = draft.title.trim()
    if (!title || title.length > 60 || draft.problemNumbers.length < 1) {
      setError('제목과 문제를 확인해 주세요. 제목은 60자 이하여야 해요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { set } = await requestJudgeClub<{ set: ClubSetView }>({
        action: 'sets-save', ...(copy ? {} : draft.id ? { id: draft.id } : {}),
        title, problemNumbers: draft.problemNumbers, shared: !copy && draft.shared,
      })
      setOpened(set)
      setDraft(fromSet(set))
      setSets((before) => [set, ...before.filter((entry) => entry.id !== set.id)])
      setMessage(copy ? '내 문제집으로 복사했습니다.' : '문제집을 저장했습니다.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '문제집을 저장하지 못했어요.')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!opened?.owned || !window.confirm(`“${opened.title}” 문제집을 삭제할까요?`)) return
    setSaving(true)
    setError('')
    try {
      await requestJudgeClub<{ deleted: true }>({ action: 'sets-delete', id: opened.id })
      setSets((before) => before.filter((entry) => entry.id !== opened.id))
      setOpened(null)
      setDraft(empty())
      setMessage('문제집을 삭제했습니다.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '문제집을 삭제하지 못했어요.')
    } finally { setSaving(false) }
  }

  const share = async () => {
    if (!opened?.shared) return
    try {
      await navigator.clipboard.writeText(new URL(`/study/algorithms/problem-sets?set=${encodeURIComponent(opened.id)}`, window.location.origin).href)
      setMessage('공유 링크를 복사했습니다.')
    } catch { setError('공유 링크를 복사하지 못했어요.') }
  }

  return <main className="study-page club-sets-page">
    <div className="club-sets-inner">
      <Link to="/study/algorithms" className="club-sets-back"><ArrowLeft size={16} aria-hidden="true" />알고리즘 문제</Link>
      <header className="club-sets-heading"><PageHeading>내 문제집</PageHeading><p>번호로 문제를 모아 풀고, 링크로 동아리원에게 공유하세요.</p></header>
      <div className="club-sets-grid">
        <aside className="club-sets-list" aria-label="내 문제집 목록">
          <div className="club-sets-list-title"><h2>내 문제집 목록</h2><button type="button" onClick={() => { setOpened(null); setDraft(empty()); setError(''); setMessage('') }}><Plus size={15} aria-hidden="true" />새 문제집</button></div>
          {loading && <p role="status">문제집을 불러오는 중...</p>}
          {!loading && sets.length === 0 && <p>저장한 문제집이 없어요. 첫 문제집을 만들어 보세요.</p>}
          <ul>{sets.map((set) => <li key={set.id}><button type="button" aria-current={opened?.id === set.id ? 'true' : undefined} onClick={() => void open(set.id)}><strong>{set.title}</strong><small>{set.problemNumbers.length}문제{set.shared && ' · 공유 중'}</small></button></li>)}</ul>
        </aside>
        <section className="club-sets-editor" aria-label={opened?.owned === false ? '공유된 문제집' : '문제집 편집'}>
          {opened?.owned === false ? <>
            <h2>{opened.title}</h2><p>{opened.problemNumbers.length}문제 · 공유된 문제집</p>
            <button type="button" onClick={() => void save(true)} disabled={saving}>내 문제집으로 복사</button>
          </> : <>
            <h2>{draft.id ? '문제집 수정' : '새 문제집'}</h2>
            <label>제목<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={60} placeholder="예: 이번 주 스터디 문제" /></label>
            <div className="club-sets-add"><label>문제 번호<input inputMode="numeric" pattern="[0-9]*" value={input} onChange={(event) => setInput(event.target.value)} placeholder="문제 번호" /></label><button type="button" onClick={add}>문제 담기</button></div>
            <label className="club-sets-share"><input type="checkbox" checked={draft.shared} onChange={(event) => setDraft({ ...draft, shared: event.target.checked })} />링크가 있는 동아리원에게 공유</label>
          </>}
          <h3>담긴 문제 {draft.problemNumbers.length}/40</h3>
          <ol className="club-sets-problems">{draft.problemNumbers.map((number) => {
            const problem = catalog.find((entry) => entry.number === number)?.problem
            return <li key={number}><Link to={numberedProblemPath(number)}><span>{number}번</span><strong>{problem?.title ?? '문제를 찾을 수 없어요'}</strong></Link>{opened?.owned !== false && <button type="button" aria-label={`${number}번 문제 빼기`} onClick={() => setDraft({ ...draft, problemNumbers: draft.problemNumbers.filter((item) => item !== number) })}>빼기</button>}</li>
          })}</ol>
          {error && <p role="alert">{error}</p>}{!loading && error && sets.length === 0 && <button type="button" onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>다시 시도</button>}{message && <p role="status">{message}</p>}
          {opened?.owned !== false && <div className="club-sets-actions"><button type="button" className="club-sets-primary" disabled={saving} onClick={() => void save()}><Check size={16} aria-hidden="true" />{saving ? '저장 중...' : '문제집 저장'}</button>{opened?.owned && <button type="button" disabled={saving} onClick={() => void remove()}><Trash2 size={15} aria-hidden="true" />삭제</button>}</div>}
          {opened?.shared && <button type="button" className="club-sets-copy" onClick={() => void share()}><Copy size={15} aria-hidden="true" />공유 링크 복사</button>}
        </section>
      </div>
    </div>
  </main>
}

export default function ClubProblemSetsPage() {
  const { user, loading, authError } = useAuth()
  if (loading) return <main className="study-page club-sets-page"><p role="status">로그인 상태를 확인하는 중...</p></main>
  if (authError) return <main className="study-page club-sets-page"><AuthCheckFailed /></main>
  if (!user) return <main className="study-page club-sets-page"><MembersGate title="문제집은 동아리원만 만들 수 있어요" /></main>
  return <ProblemSetsBody key={user.studentId} />
}
