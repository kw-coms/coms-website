import PageHeading from './PageHeading'
import { Lock } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

// One line per members-only section, by path prefix. Each states what the page holds.
const SECTION_LINES: Array<[RegExp, string]> = [
  [/^\/notices/, '공지, 홍보, 소모임, 취업공고를 한곳에서 볼 수 있어요.'],
  [/^\/resources/, '세미나, 프로젝트, 학술회지 자료를 모아 두었어요.'],
  [/^\/community/, '동아리원들이 글을 올리고 이야기하는 게시판이에요.'],
  [/^\/(activity-log|monthly-calendar)/, '동아리 활동 기록과 월별 일정을 볼 수 있어요.'],
  [/^\/activity-events/, '회지와 인기투표 이벤트가 열리는 곳이에요.'],
  [/^\/gatherings/, '스터디나 MT 같은 모임을 열고 신청할 수 있어요.'],
  [/^\/meet/, '모임 시간을 맞추는 일정 조율 투표예요.'],
  [/^\/attendance/, '세미나에서 출석 코드를 입력해 출석을 남겨요.'],
  [/^\/settings/, '비밀번호를 바꾸는 계정 설정이에요.'],
]
const FALLBACK_LINE = '이 페이지는 로그인한 동아리원에게만 열려요.'

/**
 * Guide card for a guest on a members-only page: what it is, and the two ways forward.
 * `title` and `children` override the per-section copy (the study pages use their own). `heading` is h1 unless the page already has its own h1.
 */
export default function MembersGate({ title = '동아리원 전용 공간이에요', heading = 'h1', children }: { title?: string; heading?: 'h1' | 'h2'; children?: React.ReactNode }) {
  const Heading = heading === 'h1' ? PageHeading : 'h2'
  const location = useLocation()
  const line = SECTION_LINES.find(([pattern]) => pattern.test(location.pathname))?.[1] ?? FALLBACK_LINE
  return (
    <section data-members-gate aria-labelledby="members-gate-title" className="mx-auto my-10 flex max-w-xl flex-col items-center gap-3 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-8 text-center shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
      <Lock size={28} aria-hidden="true" className="text-[var(--app-accent-text)]" />
      <Heading id="members-gate-title" className="text-xl font-bold text-[var(--app-text)]">{title}</Heading>
      <p className="text-sm text-[var(--app-muted)]">{children ?? line}</p>
      <p className="text-sm text-[var(--app-muted)]">로그인하면 바로 볼 수 있어요. 아직 동아리원이 아니라면 가입 안내를 확인해 보세요.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to="/login" state={{ from: location }} className="apple-action-primary inline-flex min-h-10 items-center justify-center px-5 py-2 text-sm">로그인</Link>
        <Link to="/recruit" className="apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2 text-sm">가입 안내 보기</Link>
      </div>
    </section>
  )
}

/** Auth could not be confirmed (a transient /api/auth/me failure): not a guest, so no gate. Offers a retry. */
export function AuthCheckFailed() {
  const { retryAuth } = useAuth()
  return (
    <div role="alert" className="mx-auto my-10 flex max-w-xl flex-col items-center gap-3 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-8 text-center">
      <PageHeading className="text-base font-bold text-[var(--app-text)]">로그인 상태를 확인하지 못했어요</PageHeading>
      <button type="button" onClick={() => void retryAuth()} className="apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2 text-sm">다시 시도</button>
    </div>
  )
}
