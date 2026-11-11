import { Link } from 'react-router-dom'

// The four member tools are one run: find a time, gather people, check who came, split teams.
const STEPS = [
  { key: 'meet', to: '/meet', title: '일정 조율', hint: '모두 되는 시간을 찾습니다.' },
  { key: 'gatherings', to: '/gatherings', title: '모임 신청', hint: '함께할 사람을 모읍니다.' },
  { key: 'attendance', to: '/attendance', title: '출석 체크', hint: '온 사람을 확인합니다.' },
  { key: 'draw', to: '/draw', title: '뽑기', hint: '조를 나누고 순서를 정합니다.' },
] as const

export type ToolFlowKey = (typeof STEPS)[number]['key']

export default function ToolFlow({ current }: { current: ToolFlowKey }) {
  return (
    <nav aria-label="다음 단계" data-testid="tool-flow" className="border-b border-[var(--app-hairline)] px-4 py-3 sm:px-6">
      <p className="mb-2 text-xs font-bold text-[var(--app-muted)]">다음 단계</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.key}>
            <Link
              to={step.to}
              aria-current={step.key === current ? 'page' : undefined}
              className={`flex min-h-11 flex-col justify-center rounded-lg border px-3 py-1.5 text-xs transition ${
                step.key === current
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]'
                  : 'border-[var(--app-hairline)] hover:bg-black/5'
              }`}
            >
              <span className="font-bold text-[var(--app-text)]">{index + 1}. {step.title}</span>
              <span className="text-[var(--app-muted)]">{step.hint}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
