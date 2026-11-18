import { useState, type FormEvent } from 'react'
import type { Scores } from '../../services/hackathonApi'
import { CRITERIA } from './hackathon'

export default function HackathonScoreForm({ projectId, onSubmit, initial, disabled = false, submitLabel = '평가 제출', note }: {
  projectId: string
  onSubmit: (scores: Scores & { feedback: string }) => Promise<void>
  initial?: Scores & { feedback: string }
  disabled?: boolean
  submitLabel?: string
  note?: string
}) {
  const [scores, setScores] = useState<Record<keyof Scores, string>>(() => Object.fromEntries(CRITERIA.map(({ key }) => [key, initial ? String(initial[key]) : ''])) as Record<keyof Scores, string>)
  const [feedback, setFeedback] = useState(initial?.feedback ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const selected = CRITERIA.filter(({ key }) => scores[key] !== '').length
  const total = CRITERIA.reduce((sum, { key }) => sum + Number(scores[key]), 0)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (disabled || pending || selected !== CRITERIA.length) return
    setPending(true)
    setError('')
    try {
      const values = Object.fromEntries(CRITERIA.map(({ key }) => [key, Number(scores[key])])) as Scores
      await onSubmit({ ...values, feedback: feedback.trim() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '평가를 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { setPending(false) }
  }
  return <form onSubmit={submit} aria-label={`${projectId} 채점`}>
    <fieldset disabled={disabled || pending} className="hackathon-scores">
      <legend className="mb-4 text-lg font-bold">항목별 평가 <span className="text-sm font-normal text-[var(--app-muted)]">각 20점 · 총 100점</span></legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {CRITERIA.map(({ key, label, description }) => <label key={key} className="block min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span id={`${projectId}-${key}-help`} className="mt-1 block text-xs text-[var(--app-muted)]">{description}</span>
          <select aria-describedby={`${projectId}-${key}-help`} required value={scores[key]} onChange={(event) => setScores((current) => ({ ...current, [key]: event.target.value }))} className="hackathon-input mt-2">
            <option value="">점수 선택</option>
            {Array.from({ length: 21 }, (_, score) => <option key={score} value={score}>{score}점</option>)}
          </select>
        </label>)}
      </div>
      <label className="mt-5 block text-sm font-semibold">팀에게 전할 피드백 <span className="font-normal text-[var(--app-muted)]">선택</span>
        <textarea maxLength={2000} rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="좋았던 점이나 개선 아이디어를 남겨 주세요." className="hackathon-input mt-2 resize-y" />
      </label>
      <p className="mt-2 text-xs text-[var(--app-muted)]">피드백은 운영진이 확인해 해당 팀에 전달합니다. {feedback.length}/2,000자</p>
    </fieldset>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm font-semibold">{selected === 5 ? `합계 ${total} / 100점` : `${selected} / 5개 항목 선택`}</p>
      <button type="submit" disabled={disabled || pending || selected !== 5} className="apple-action-primary min-h-11 w-full px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{pending ? '제출 중…' : submitLabel}</button>
    </div>
    {note && <p className="mt-3 text-sm text-[var(--app-muted)]">{note}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{error}</p>}
  </form>
}
