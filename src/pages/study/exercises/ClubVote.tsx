import { useEffect, useState } from 'react'
import { requestJudgeClub, type ClubVoteView } from './clubApi'
import { judgeTier } from './judgeTiers'
import './club-social.css'

const tiers = Array.from({ length: 31 }, (_, index) => index + 1)

export default function ClubVote({ number, solved }: { number: number; solved?: boolean }) {
  const [vote, setVote] = useState<ClubVoteView | null>(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void requestJudgeClub<ClubVoteView>({ action: 'vote-get', problemNumber: number }, controller.signal)
      .then((result) => {
        setVote(result)
        setSelected(result.ownVote === null ? '' : String(result.ownVote))
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '투표를 불러오지 못했어요.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [number, solved])

  const save = async () => {
    if (!vote?.canVote || saving || !selected) return
    setSaving(true)
    setError('')
    try {
      const result = await requestJudgeClub<ClubVoteView>({ action: 'vote-put', problemNumber: number, tier: Number(selected) })
      setVote(result)
      setSelected(result.ownVote === null ? '' : String(result.ownVote))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '투표를 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="club-vote" aria-labelledby="club-vote-title">
    <div className="club-vote-head">
      <h2 id="club-vote-title">난이도 투표</h2>
      {vote && <p role="status">{vote.count}명 참여{vote.median !== null && ` · 중간값 ${judgeTier({ level: 1, difficultyTier: vote.median }).label}`}</p>}
    </div>
    {loading && <p role="status">투표를 불러오는 중...</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && error && <button type="button" onClick={() => { setVote(null); setLoading(true); setError(''); void requestJudgeClub<ClubVoteView>({ action: 'vote-get', problemNumber: number }).then((result) => { setVote(result); setSelected(result.ownVote === null ? '' : String(result.ownVote)) }).catch((cause) => setError(cause instanceof Error ? cause.message : '투표를 불러오지 못했어요.')).finally(() => setLoading(false)) }}>다시 시도</button>}
    {vote && <>
      {vote.canVote ? <div className="club-vote-form">
        <label>체감 난이도
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">등급 선택</option>
            {tiers.map((value) => <option key={value} value={value}>{judgeTier({ level: 1, difficultyTier: value }).label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void save()} disabled={saving || !selected}>{saving ? '저장 중...' : vote.ownVote === null ? '투표하기' : '투표 변경'}</button>
      </div> : <p>이 문제를 해결하면 난이도에 투표할 수 있어요.</p>}
      {vote.ownVote !== null && <p>내 투표 {judgeTier({ level: 1, difficultyTier: vote.ownVote }).label}</p>}
    </>}
  </section>
}
