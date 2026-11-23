import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, FilePlus2, FlaskConical, Plus, Send, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { judgeTier } from './judgeTiers'
import { createEditor, type PgEditor } from '../playground/editor'
import { readCodingSettings } from './codingSettings'
import { JUDGE_LANGUAGES, LANG_NAMES } from './types'
import type { ExLang } from './types'
import { authoringAction, emptyProblemDraft, verifyProblem, type ProblemCase, type ProblemDraft, type ProblemProposal, type ProblemSummary, type ProblemStatus, type VerificationResult } from './authoringApi'
import '../study.css'
import './problem-authoring.css'

const statusText: Record<ProblemStatus, string> = {
  draft: '작성 중', pending: '검토 중', changes: '수정 요청', published: '공개됨',
}

function FieldPair({ title, number, value, onChange, onRemove, removeDisabled }: {
  title: string; number: number; value: ProblemCase
  onChange(value: ProblemCase): void; onRemove(): void; removeDisabled: boolean
}) {
  return <div className="authoring-case">
    <div className="authoring-case-head"><h4>{title} {number}</h4><button type="button" aria-label={`${title} ${number} 삭제`} onClick={onRemove} disabled={removeDisabled}><Trash2 size={15} aria-hidden="true" />삭제</button></div>
    <div className="authoring-case-grid">
      <label>입력<textarea value={value.stdin} rows={3} spellCheck={false} onChange={(event) => onChange({ ...value, stdin: event.target.value })} placeholder="입력이 없는 문제는 비워 두세요" /></label>
      <label>기대 출력<textarea value={value.expected} rows={3} spellCheck={false} onChange={(event) => onChange({ ...value, expected: event.target.value })} placeholder="프로그램의 출력" /></label>
    </div>
  </div>
}

function ProblemForm({ draft, setDraft, readonly }: {
  draft: ProblemDraft; setDraft(draft: ProblemDraft): void; readonly: boolean
}) {
  const [topicsText, setTopicsText] = useState(() => draft.topics.join(', '))
  const updateCases = (key: 'examples' | 'tests', at: number, value?: ProblemCase) => {
    const next = [...draft[key]]
    if (value) next[at] = value
    else next.splice(at, 1)
    setDraft({ ...draft, [key]: next })
  }
  return <fieldset className="authoring-fields" disabled={readonly}>
    <section className="authoring-form-section" aria-label="문제 설명">
      <div className="authoring-section-head"><div><h3>문제 설명</h3><p>회원이 문제를 읽고 입출력 조건을 이해할 수 있게 작성하세요.</p></div></div>
      <label>문제 제목<input value={draft.title} maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: 두 수의 합" /></label>
      <label>문제 내용<textarea value={draft.statement} maxLength={10_000} rows={8} onChange={(event) => setDraft({ ...draft, statement: event.target.value })} placeholder="무엇을 구해야 하는지 설명하세요." /></label>
      <div className="authoring-two-column"><label>입력 설명<textarea value={draft.inputSpec} maxLength={3_000} rows={4} onChange={(event) => setDraft({ ...draft, inputSpec: event.target.value })} placeholder="값의 범위와 형식을 설명하세요." /></label>
        <label>출력 설명<textarea value={draft.outputSpec} maxLength={3_000} rows={4} onChange={(event) => setDraft({ ...draft, outputSpec: event.target.value })} placeholder="출력할 값과 형식을 설명하세요." /></label></div>
      <div className="authoring-two-column"><label>예상 난이도<select value={draft.difficultyTier} onChange={(event) => setDraft({ ...draft, difficultyTier: Number(event.target.value) })}>{Array.from({ length: 32 }, (_, index) => <option value={index} key={index}>{judgeTier({ level: 1, difficultyTier: index }).label}</option>)}</select></label>
        <label>주제 태그<input value={topicsText} onChange={(event) => {
          setTopicsText(event.target.value)
          setDraft({ ...draft, topics: event.target.value.split(',').map((topic) => topic.trim()).filter(Boolean) })
        }} placeholder="예: 배열, 구현" /><small>쉼표로 구분해 주세요.</small></label></div>
    </section>

    <section className="authoring-form-section" aria-label="공개 예제">
      <div className="authoring-section-head"><div><h3>공개 예제</h3><p>문제 화면에 표시됩니다. 1~3개를 넣을 수 있어요.</p></div></div>
      {draft.examples.map((entry, index) => <FieldPair key={index} title="예제" number={index + 1} value={entry} onChange={(value) => updateCases('examples', index, value)} onRemove={() => updateCases('examples', index)} removeDisabled={draft.examples.length === 1} />)}
      <button type="button" className="authoring-outline" disabled={draft.examples.length >= 3 || draft.examples.length + draft.tests.length >= 10} onClick={() => setDraft({ ...draft, examples: [...draft.examples, { stdin: '', expected: '' }] })}><Plus size={16} aria-hidden="true" />예제 추가</button>
    </section>

    <section className="authoring-form-section" aria-label="비공개 채점 사례">
      <div className="authoring-section-head"><div><h3>채점 사례</h3><p>제출 코드 채점에 사용합니다. 예제와 함께 검증하며 회원 풀이 화면에는 표시되지 않아요.</p></div></div>
      {draft.tests.map((entry, index) => <FieldPair key={index} title="채점 사례" number={index + 1} value={entry} onChange={(value) => updateCases('tests', index, value)} onRemove={() => updateCases('tests', index)} removeDisabled={draft.tests.length <= 5} />)}
      <button type="button" className="authoring-outline" disabled={draft.tests.length >= 7 || draft.examples.length + draft.tests.length >= 10} onClick={() => setDraft({ ...draft, tests: [...draft.tests, { stdin: '', expected: '' }] })}><Plus size={16} aria-hidden="true" />채점 사례 추가</button>
    </section>

    <section className="authoring-form-section" aria-label="정답 코드">
      <div className="authoring-section-head"><div><h3>정답 코드</h3><p>문제 검증에 쓰일 기준 코드를 작성하세요.</p></div></div>
      <div className="authoring-two-column"><label>검증 언어<select value={draft.reference.lang} onChange={(event) => setDraft({ ...draft, reference: { lang: event.target.value as ProblemDraft['reference']['lang'], code: draft.reference.code } })}>{JUDGE_LANGUAGES.map((lang) => <option value={lang} key={lang}>{LANG_NAMES[lang]}</option>)}</select></label>
        <label>출력 비교<select value={draft.compare} onChange={(event) => setDraft({ ...draft, compare: event.target.value as ProblemDraft['compare'] })}><option value="tokens">공백으로 구분한 값</option><option value="lines">줄 단위</option></select></label></div>
      <div className="authoring-reference"><strong>기준 코드</strong><ReferenceCodeEditor key={draft.reference.lang} lang={draft.reference.lang} value={draft.reference.code} readOnly={readonly} onChange={(value) => setDraft({ ...draft, reference: { ...draft.reference, code: value } })} /></div>
    </section>
  </fieldset>
}

function ReferenceCodeEditor({ lang, value, readOnly, onChange }: {
  lang: ExLang; value: string; readOnly: boolean; onChange(value: string): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const initialValue = useRef(value)
  const onChangeRef = useRef(onChange)
  const editor = useRef<PgEditor | null>(null)
  const { user } = useAuth()
  const [appearance] = useState(() => readCodingSettings(user?.studentId).appearance)
  useEffect(() => { initialValue.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => {
    if (!host.current) return undefined
    let disposed = false
    let instance: PgEditor | null = null
    void createEditor({
      parent: host.current, lang, doc: initialValue.current,
      label: '기준 코드', readOnly, appearance,
      onChange: (code) => onChangeRef.current(code), onRun: () => {},
    }).then((created) => {
      if (disposed) created.destroy()
      else { instance = created; editor.current = created }
    })
    return () => { disposed = true; instance?.destroy(); if (editor.current === instance) editor.current = null }
  }, [lang, readOnly, appearance])
  return <div ref={host} className="authoring-code" />
}

function AuthoringWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient()
  const [list, setList] = useState<ProblemSummary[]>([])
  const [selected, setSelected] = useState<ProblemProposal | null>(null)
  const [draft, setDraft] = useState<ProblemDraft>(emptyProblemDraft)
  const [dirty, setDirty] = useState(false)
  const [review, setReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [verification, setVerification] = useState<VerificationResult['judge'] | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    void authoringAction<{ proposals: ProblemSummary[] }>({ action: 'problem-list' })
      .then(({ proposals }) => { if (!cancelled) setList(proposals) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '제안 목록을 불러오지 못했어요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const show = (proposal: ProblemProposal) => {
    setSelected(proposal)
    setDraft(structuredClone(proposal.draft))
    setVerification(null)
    setNote('')
    setDirty(false)
    setList((before) => [proposal, ...before.filter((item) => item.id !== proposal.id)])
  }
  const change = (next: ProblemDraft) => { setDraft(next); setDirty(true); setVerification(null); setMessage('') }
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { proposal } = await authoringAction<{ proposal: ProblemProposal }>(body)
      show(proposal)
      if (body.action === 'problem-publish') void queryClient.invalidateQueries({ queryKey: ['judge-published-problems'] })
      setMessage(({ 'problem-save': '초안을 저장했습니다.', 'problem-submit': '문제 검토를 요청했습니다.', 'problem-return': '수정을 요청했습니다.', 'problem-publish': '문제를 공개했습니다.' } as Record<string, string>)[String(body.action)] ?? '')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const save = () => {
    if (!draft.title.trim() || !draft.statement.trim() || !draft.reference.code.trim() ||
        draft.examples.length < 1 || draft.examples.length > 3 || draft.tests.length < 5 || draft.tests.length > 7 || draft.examples.length + draft.tests.length > 10) {
      setError('문제 설명·정답 코드와 공개 예제, 채점 사례 5개 이상을 확인해 주세요.')
      return
    }
    const allInputs = [...draft.examples, ...draft.tests].map((entry) => entry.stdin)
    if (new Set(allInputs).size !== allInputs.length) {
      setError('예제와 채점 사례에 중복된 입력이 있어요. 입력마다 다른 값을 사용해 주세요.')
      return
    }
    void act({ action: 'problem-save', ...(selected ? { id: selected.id, revision: selected.revision } : {}), draft })
  }
  const verify = async () => {
    if (!selected || dirty) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await verifyProblem(selected.id)
      show(result.proposal)
      setVerification(result.judge)
      setMessage(result.judge.solved ? '기준 코드가 모든 사례를 통과했습니다.' : '검증 결과를 확인하고 문제를 수정해 주세요.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '검증을 실행하지 못했어요.') }
    finally { setBusy(false) }
  }
  const shown = list.filter((item) => review ? canManage && item.status === 'pending' : item.owned)
  const editable = selected ? selected.owned && (selected.status === 'draft' || selected.status === 'changes') : !review
  const canVerify = selected && !dirty && (selected.owned || canManage) && (selected.status === 'draft' || selected.status === 'changes' || selected.status === 'pending')
  const mayLeaveDraft = () => !dirty || window.confirm('저장하지 않은 내용을 버리고 이동할까요?')

  return <main className="study-page authoring-page">
    <div className="authoring-inner">
      <Link to="/study/algorithms" className="authoring-back"><ArrowLeft size={16} aria-hidden="true" />알고리즘 문제</Link>
      <header className="authoring-heading"><div><PageHeading>새 문제 만들기</PageHeading><p>문제를 작성하고 정답 코드를 검증해 동아리 문제로 제안하세요.</p></div><span className="authoring-spark" aria-hidden="true"><FilePlus2 size={30} /></span></header>

      <div className="authoring-layout">
        <aside className="authoring-sidebar" aria-label="문제 제안 목록">
          <div className="authoring-sidebar-head"><h2>문제 제안</h2><button type="button" onClick={() => { if (!mayLeaveDraft()) return; setSelected(null); setDraft(emptyProblemDraft()); setDirty(false); setReview(false); setVerification(null); setError(''); setMessage('') }}><Plus size={16} aria-hidden="true" />새 문제</button></div>
          {canManage && <div className="authoring-tabs" role="tablist" aria-label="제안 구분"><button type="button" role="tab" aria-selected={!review} onClick={() => { if (!mayLeaveDraft()) return; setReview(false); setSelected(null); setDraft(emptyProblemDraft()); setDirty(false) }}>내 문제</button><button type="button" role="tab" aria-selected={review} onClick={() => { if (!mayLeaveDraft()) return; setReview(true); setSelected(null); setDraft(emptyProblemDraft()); setDirty(false) }}>검토 요청 {list.filter((entry) => entry.status === 'pending').length}</button></div>}
          {loading && <p role="status">제안 목록을 불러오는 중...</p>}
          {!loading && shown.length === 0 && <p className="authoring-empty">{review ? '검토할 문제가 없어요.' : '아직 만든 문제가 없어요.'}</p>}
          <ul>{shown.map((item) => <li key={item.id}><button type="button" aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => {
            if (!mayLeaveDraft()) return
            setBusy(true); setError(''); void authoringAction<{ proposal: ProblemProposal }>({ action: 'problem-get', id: item.id })
              .then(({ proposal }) => show(proposal)).catch((cause) => setError(cause instanceof Error ? cause.message : '문제를 열지 못했어요.')).finally(() => setBusy(false))
          }}><span className="authoring-list-title">{item.title}</span><span className={`authoring-chip is-${item.status}`}>{statusText[item.status]}</span><small>{item.number ? `${item.number}번` : `수정 ${item.revision}회`}{item.verified && ' · 검증 완료'}</small><ChevronRight size={16} aria-hidden="true" /></button></li>)}</ul>
        </aside>

        <div className="authoring-main">
          {selected && <div className="authoring-current"><span className={`authoring-chip is-${selected.status}`}>{statusText[selected.status]}</span><strong>{selected.title}</strong>{selected.number && <Link to={`/study/algorithms/${selected.number}`}>{selected.number}번 문제 보기</Link>}</div>}
          {selected?.note && <div className="authoring-review-note" role="note"><strong>검토 의견</strong><p>{selected.note}</p></div>}
          {review && !selected ? <div className="authoring-prompt"><FlaskConical size={28} aria-hidden="true" /><h2>검토할 문제를 선택하세요</h2><p>기준 코드의 전체 사례 통과 여부를 확인한 뒤 공개할 수 있습니다.</p></div> : <>
            <ProblemForm key={`${selected?.id ?? 'new'}:${selected?.revision ?? 0}`} draft={draft} setDraft={change} readonly={!editable || busy} />
            {error && <p className="authoring-alert" role="alert">{error}</p>}
            {message && <p className="authoring-message" role="status">{message}</p>}
            {verification && <div className={`authoring-verification ${verification.solved ? 'is-good' : 'is-bad'}`} role="region" aria-label="검증 결과"><strong>{verification.solved ? '전체 사례 통과' : '검증 실패'}</strong><span>{verification.passed}/{verification.total} 통과</span>{verification.compileError && <p>기준 코드에 컴파일 오류가 있습니다.</p>}{verification.stderr && <pre>{verification.stderr}</pre>}{verification.verdicts.length > 0 && <ol>{verification.verdicts.map((verdict, index) => <li key={index}><span>{index < draft.examples.length ? `예제 ${index + 1}` : `채점 사례 ${index + 1 - draft.examples.length}`}</span><strong data-verdict={verdict}>{verdict === 'correct' ? '통과' : verdict === 'wrong' ? '오답' : verdict === 'timeout' ? '시간 초과' : verdict === 'runtime' ? '실행 오류' : verdict === 'skipped' ? '미실행' : '실패'}</strong></li>)}</ol>}</div>}
            {selected?.verification && !dirty && !verification && <div className={`authoring-verification ${selected.verified ? 'is-good' : 'is-bad'}`} role="region" aria-label="저장된 검증 결과"><strong>{selected.verified ? '검증 완료' : '이전 검증 결과'}</strong><span>{selected.verification.passed}/{selected.verification.total} 통과{!selected.verified && ' · 현재 버전 재검증 필요'}</span></div>}
            <div className="authoring-actions">
              {editable && <button type="button" className="authoring-primary" disabled={busy} onClick={save}><Check size={16} aria-hidden="true" />{selected ? '변경 저장' : '초안 저장'}</button>}
              {canVerify && <button type="button" className="authoring-outline" disabled={busy} onClick={() => void verify()}><FlaskConical size={16} aria-hidden="true" />기준 코드 검증</button>}
              {selected && selected.owned && selected.status !== 'published' && selected.status !== 'pending' && !canManage && <button type="button" className="authoring-outline" disabled={busy || dirty} onClick={() => void act({ action: 'problem-submit', id: selected.id, revision: selected.revision })}><Send size={16} aria-hidden="true" />검토 요청</button>}
              {selected && canManage && selected.status !== 'published' && (selected.status === 'pending' || selected.owned) && <button type="button" className="authoring-primary" disabled={busy || dirty || !selected.verified} onClick={() => void act({ action: 'problem-publish', id: selected.id, revision: selected.revision })}>번호 부여하고 공개</button>}
            </div>
            {selected && canManage && selected.status === 'pending' && <div className="authoring-return"><label>수정 요청 내용<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="어떤 부분을 고치면 되는지 작성해 주세요." /></label><button type="button" disabled={busy || !note.trim()} onClick={() => void act({ action: 'problem-return', id: selected.id, revision: selected.revision, note: note.trim() })}>수정 요청 보내기</button></div>}
          </>}
        </div>
      </div>
    </div>
  </main>
}

export default function ProblemAuthoringPage() {
  const { user, loading, authError } = useAuth()
  if (loading) return <main className="study-page authoring-page"><p role="status">로그인 상태를 확인하는 중...</p></main>
  if (authError) return <main className="study-page authoring-page"><AuthCheckFailed /></main>
  if (!user) return <main className="study-page authoring-page"><MembersGate title="문제 제작은 동아리원만 할 수 있어요" /></main>
  return <AuthoringWorkspace key={user.studentId} canManage={user.role === 'ADMIN'} />
}
