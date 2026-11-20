import type { HackathonStatus } from '../../services/hackathonApi'
import { STATUS_META } from './hackathon'
import '../../styles/hackathon.css'

export default function HackathonStatusBadge({ status }: { status: HackathonStatus }) {
  return <span className={`hackathon-status hackathon-status--${status.toLowerCase().replace('_', '-')}`}>{STATUS_META[status].label}</span>
}
