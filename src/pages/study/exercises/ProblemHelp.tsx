import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { createCommunityPost, listCommunityPosts } from '../../../services/communityApi'
import { escapeHtml, MAX_TITLE_LENGTH } from '../../community/postEditorUtils'
import { MiniMarkdown } from './markdown'
import './problem-help.css'

type Question = {
  id: number
  title: string
  category: string
  commentCount?: number
}

const MAX_QUESTION_LENGTH = 4000

export default function ProblemHelp({ number, title, hints }: { number: number; title: string; hints: string[] }) {
  const [open, setOpen] = useState(false)
  const [shownHints, setShownHints] = useState(0)
  const [questionTitle, setQuestionTitle] = useState('')
  const [questionBody, setQuestionBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const prefix = `[문제 ${number}번] `
  const queryKey = ['judge-questions', number]
  const questions = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const posts = await listCommunityPosts()
      if (!Array.isArray(posts)) return []
      return (posts as Question[]).filter((post) => post.category === 'QUESTION' && post.title?.startsWith(prefix))
    },
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const heading = questionTitle.trim()
    const body = questionBody.trim()
    if (!heading || !body) { setError('제목과 질문 내용을 입력해 주세요.'); return }
    if (prefix.length + heading.length > MAX_TITLE_LENGTH || body.length > MAX_QUESTION_LENGTH) {
      setError('제목 또는 질문 내용이 너무 깁니다.'); return
    }
    setError('')
    setSaving(true)
    try {
      const problemUrl = new URL(`/study/algorithms/${number}`, window.location.origin).href
      const content = JSON.stringify([{ type: 'text', content: `${escapeHtml(body).replace(/\n/g, '<br>')}<br><br><a href="${escapeHtml(problemUrl)}">문제 ${number}번으로 돌아가기</a>` }])
      const saved = await createCommunityPost({ title: prefix + heading, content, category: 'QUESTION' }) as { id?: number }
      if (!Number.isSafeInteger(saved?.id) || !saved.id) throw new Error('작성한 질문을 열 수 없어요.')
      await queryClient.invalidateQueries({ queryKey })
      navigate(`/community/${saved.id}`)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : '질문을 등록하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return <section id="judge-help" className="judge-help" aria-labelledby="judge-help-title">
    <h2 id="judge-help-title">힌트와 질문</h2>
    {hints.length > 0 && <div className="judge-help-hints">
      <h3>힌트</h3>
      {hints.slice(0, shownHints).map((hint, index) => <div key={index} className="judge-help-hint"><strong>힌트 {index + 1}</strong><MiniMarkdown text={hint} /></div>)}
      {shownHints < hints.length && <button type="button" onClick={() => setShownHints((count) => count + 1)}>힌트 {shownHints + 1} 보기</button>}
    </div>}
    <div className="judge-help-discussion">
      <div className="judge-help-discussion-head">
        <div><h3>이 문제 질문</h3><p>{title}을 풀다가 막힌 부분을 동아리원에게 물어보세요.</p></div>
        <button type="button" aria-expanded={open} aria-controls="judge-help-questions" onClick={() => setOpen((value) => !value)}>{open ? '질문 닫기' : '질문 보기'}</button>
      </div>
      {open && <div id="judge-help-questions">
        {questions.isPending && <p role="status">질문을 불러오는 중...</p>}
        {questions.isError && <div role="alert"><p>질문을 불러오지 못했어요.</p><button type="button" onClick={() => void questions.refetch()}>다시 불러오기</button></div>}
        {questions.isSuccess && (questions.data.length > 0
          ? <ul>{questions.data.map((post) => <li key={post.id}><Link to={`/community/${post.id}`}>{post.title.slice(prefix.length)}<span>{post.commentCount ? `답글 ${post.commentCount}개` : '답글 보기'}</span></Link></li>)}</ul>
          : <p>아직 이 문제의 질문이 없어요.</p>)}
        <form onSubmit={(event) => void submit(event)}>
          <label>질문 제목<input value={questionTitle} onChange={(event) => setQuestionTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH - prefix.length} placeholder="궁금한 내용을 짧게 적어 주세요" required /></label>
          <label>질문 내용<textarea value={questionBody} onChange={(event) => setQuestionBody(event.target.value)} maxLength={MAX_QUESTION_LENGTH} rows={5} placeholder="시도한 방법과 막힌 부분을 적어 주세요" required /></label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={saving}>{saving ? '등록 중...' : '질문 등록'}</button>
        </form>
      </div>}
    </div>
  </section>
}
