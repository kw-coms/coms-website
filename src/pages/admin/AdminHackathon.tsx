import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getHackathon, listHackathonReviews, saveHackathonChairReview, setHackathonOpen } from '../../services/hackathonApi'
import { CRITERIA, summarizeHackathon } from '../../features/hackathon/hackathon'
import HackathonScoreForm from '../../features/hackathon/HackathonScoreForm'
import '../../styles/hackathon.css'

const scoreText = (score: number | null) => score === null ? '미집계' : `${score.toFixed(2)}점`

export default function AdminHackathon() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['admin', 'hackathon'], queryFn: async () => {
    const [reviews, settings] = await Promise.all([listHackathonReviews(), getHackathon()])
    return { reviews, settings }
  }, refetchOnWindowFocus: false })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (query.isPending) return <p role="status">해커톤 평가를 불러오는 중…</p>
  if (query.isError) return <div role="alert">평가를 불러오지 못했습니다. <button type="button" onClick={() => query.refetch()} className="apple-action-secondary min-h-11 px-4">다시 불러오기</button></div>
  const rows = summarizeHackathon(query.data.reviews)
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['admin', 'hackathon'] })
    await client.invalidateQueries({ queryKey: ['hackathon', 'settings'] })
  }
  return <section className="space-y-6" aria-label="해커톤 평가 관리">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">해커톤 평가</h2><p className="mt-2 text-sm text-[var(--app-muted)]">졸업생 평균 × 50% + 회장 점수 × 50%. 동점은 완성도, 주제 적합성 순입니다.</p></div>
      <Link to="/hackathon" className="apple-action-secondary inline-flex min-h-11 items-center px-4 text-sm">공개 평가 페이지</Link>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <strong className="text-sm">{query.data.settings.open ? '평가 접수 중' : '평가 마감'}</strong>
      <button type="button" disabled={pending} className="apple-action-secondary min-h-11 px-4 text-sm" onClick={async () => {
        setPending(true); setError(''); setMessage('')
        try { const result = await setHackathonOpen(!query.data.settings.open); await refresh(); setMessage(result.open ? '평가를 다시 열었습니다.' : '평가를 마감했습니다.') }
        catch (cause) { setError(cause instanceof Error ? cause.message : '접수 상태를 변경하지 못했습니다.') }
        finally { setPending(false) }
      }}>{pending ? '변경 중…' : query.data.settings.open ? '평가 마감하기' : '평가 다시 열기'}</button>
      <button type="button" onClick={() => query.refetch()} className="apple-action-secondary min-h-11 px-4 text-sm">집계 새로고침</button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
      <caption className="mb-3 text-left text-sm text-[var(--app-muted)]">모든 작품의 양쪽 평가가 모이면 순위가 표시됩니다. 마감 전 점수와 순위는 잠정 집계입니다.</caption>
      <thead><tr>{['순위', '작품', '졸업생 수', '졸업생 평균', '회장 점수', '최종 점수'].map((label) => <th key={label} scope="col" className="border-b border-[var(--app-hairline)] p-3">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.project.id}>{[row.rank ?? '대기', row.project.title, `${row.alumniCount}명`, scoreText(row.alumniAverage), scoreText(row.chairScore), scoreText(row.finalScore)].map((value, index) => <td key={index} className="border-b border-[var(--app-hairline)] p-3">{value}</td>)}</tr>)}</tbody>
    </table></div>
    {rows.map((row) => <article key={row.project.id} className="hackathon-project">
      <h3 className="mb-5 text-xl font-bold">{row.project.title} · 회장 평가</h3>
      <HackathonScoreForm key={JSON.stringify(row.chair ?? null)} projectId={`chair-${row.project.id}`} initial={row.chair} submitLabel="회장 평가 저장" onSubmit={async (scores) => {
        await saveHackathonChairReview(row.project.id, scores)
        await refresh()
        setMessage(`${row.project.title} 회장 평가를 저장했습니다.`)
      }} />
      <details className="mt-6 border-t border-[var(--app-hairline)] pt-5">
        <summary className="cursor-pointer text-sm font-bold">졸업생 평가·피드백 {row.alumniCount}건</summary>
        {row.alumni.length === 0 && <p className="mt-4 text-sm text-[var(--app-muted)]">아직 접수된 평가가 없습니다.</p>}
        <ul className="mt-4 space-y-4">{row.alumni.map((review) => <li key={review.id} className="rounded-xl border border-[var(--app-hairline)] p-4 text-sm">
          <p className="font-semibold">{review.generation}기 {review.name}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">{CRITERIA.map(({ key, label }) => `${label} ${review[key]}점`).join(' · ')}</p>
          <p className="mt-2 whitespace-pre-wrap break-words leading-7">{review.feedback || '피드백 없음'}</p>
        </li>)}</ul>
      </details>
      <button type="button" className="apple-action-secondary mt-5 min-h-11 px-4 text-sm" onClick={async () => {
        const feedbacks = [...row.alumni, ...(row.chair ? [row.chair] : [])].filter((review) => review.feedback?.trim())
        const text = `${row.project.title} · COM’s 해커톤 피드백\n\n${feedbacks.length ? feedbacks.map((review, index) => `${index + 1}. ${review.feedback}`).join('\n\n') : '아직 작성된 피드백이 없습니다.'}`
        try { await navigator.clipboard.writeText(text); setMessage(`${row.project.title} 피드백을 복사했습니다. 평가자 이름은 포함하지 않았습니다.`); setError('') }
        catch { setError('클립보드에 복사하지 못했습니다. 위 피드백을 선택해 복사해 주세요.') }
      }}>팀에 전달할 피드백 복사</button>
    </article>)}
  </section>
}
