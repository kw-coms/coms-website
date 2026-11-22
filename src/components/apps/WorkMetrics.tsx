import { Eye, MessageCircle, ThumbsUp } from 'lucide-react'

type Counts = { viewCount?: number; likeCount?: number; commentCount?: number }
const metrics = [
  { key: 'viewCount', label: '조회', Icon: Eye },
  { key: 'likeCount', label: '추천', Icon: ThumbsUp },
  { key: 'commentCount', label: '댓글', Icon: MessageCircle },
] as const
const number = new Intl.NumberFormat('ko-KR')

export default function WorkMetrics({ work }: { work: Counts }) {
  return <ul className="app-work-metrics" aria-label="작품 반응">{metrics.map(({ key, label, Icon }) =>
    <li key={key}><Icon size={15} aria-hidden="true" /><span className="sr-only">{label} </span><span>{number.format(work[key] ?? 0)}</span></li>)}</ul>
}
