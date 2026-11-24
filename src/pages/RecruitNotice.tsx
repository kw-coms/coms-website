import PageHeading from '../components/PageHeading'
import { ArrowLeft, CalendarDays, CheckCircle2, Mail, PenLine, Rocket, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import RecruitFacts from '../components/RecruitFacts'
import { defaultSiteSettings, getPublicSiteSettings } from '../services/siteSettingsApi'

const recruitDetails = [
  {
    title: '모집 대상',
    icon: Users,
    body: '컴퓨터와 소프트웨어에 관심 있는 광운대학교 학생이라면 전공과 경험에 관계없이 지원할 수 있습니다.',
  },
  {
    title: '주요 활동',
    icon: Rocket,
    body: '웹/앱 개발, 알고리즘, 보안, 아두이노, 디자인, 팀 프로젝트 등 관심 분야별 스터디와 제작 활동을 진행합니다.',
  },
  {
    title: '모집 일정',
    icon: CalendarDays,
    body: '상세 일정은 COM\'s 공식 채널과 학내 공지를 통해 안내되며, 지원서 제출 후 운영진 확인을 거쳐 개별 연락드립니다.',
  },
]

const processSteps = [
  '지원서에 기본 정보, 관심 분야, 지원 동기를 작성합니다.',
  '운영진이 제출 내용을 확인한 뒤 개별 연락을 진행합니다.',
  '오리엔테이션 이후 정기 세미나와 스터디, 프로젝트 활동에 참여합니다.',
]

export default function RecruitNotice({ onBack, onApply }: { onBack: () => void; onApply: () => void }) {
  const siteSettingsQuery = useQuery({
    queryKey: ['site-settings', 'public'],
    queryFn: getPublicSiteSettings,
  })
  const siteSettings = siteSettingsQuery.data
  const contactLinks = siteSettings?.contactLinks || [{ label: '메일로 문의', href: 'mailto:kwcoms69@gmail.com' }]

  return (
    <div className="w-full min-w-0 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="apple-action-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        이전 화면으로
      </button>

      <section className="apple-board-shell">
        <div className="apple-board-hero px-6 py-8 sm:px-8 sm:py-10">
          <PageHeading className="apple-display text-4xl sm:text-6xl">COM&apos;s 신입 부원 모집 공지</PageHeading>
          <p className="apple-copy mt-4 max-w-3xl text-base sm:text-lg">
            {siteSettings?.recruitmentStatus || defaultSiteSettings.recruitHeadline}
          </p>
          <button
            type="button"
            onClick={onApply}
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--app-text)] px-5 py-3 text-base font-bold text-[var(--app-bg)] transition-colors hover:bg-[var(--theme-body-mid)]"
          >
            <PenLine size={17} aria-hidden="true" />
            지원서 작성하기
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          <article className="min-w-0 space-y-8 p-5 sm:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-accent-text)]">
                <PenLine size={16} />
                모집 안내
              </div>
              <p className="text-[15px] leading-8 text-[var(--theme-body-mid)]">
                COM&apos;s는 함께 배우고 꾸준히 만들어갈 신입 부원을 모집합니다. 프로그래밍이 처음이어도 괜찮습니다.
                서로의 속도에 맞춰 공부하고, 작은 아이디어를 실제 프로젝트로 옮기며 성장할 사람을 기다립니다.
              </p>
              <p className="text-[15px] leading-8 text-[var(--theme-body-mid)]">
                정기 세미나와 스터디를 통해 기초를 다지고, 관심 분야가 비슷한 부원들과 팀을 이뤄 웹사이트, 앱,
                아두이노, 소프트웨어 프로젝트를 제작합니다. 개발 경험보다 중요한 것은 배우려는 태도와 꾸준히
                참여하려는 마음입니다.
              </p>
            </div>

            <RecruitFacts settings={siteSettings} />

            <div className="grid gap-3 md:grid-cols-3">
              {recruitDetails.map(({ title, icon: Icon, body }) => (
                <div key={title} className="apple-soft-panel p-4">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-text)]">
                    <Icon size={19} aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-black">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
                    {title === '모집 일정' ? (siteSettings?.recruitmentPeriod || body) : body}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5">
              <h2 className="text-lg font-black text-[var(--app-text)]">지원 절차</h2>
              <ol className="mt-4 space-y-3">
                {processSteps.map((step) => (
                  <li key={step} className="flex gap-3 text-sm leading-6 text-[var(--app-muted)]">
                    <CheckCircle2 size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--app-accent-text)]" />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </article>

          <aside className="min-w-0 space-y-6 border-t border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5 sm:p-8 lg:border-t-0 lg:border-l">
            <p className="text-sm leading-7 text-[var(--app-muted)]">
              COM&apos;s는 혼자서는 막막했던 공부를 함께 이어가는 공간입니다. 기초부터 차근차근 시작해도 좋고,
              이미 만든 것이 있다면 더 큰 프로젝트로 확장해도 좋습니다.
            </p>

            <div className="apple-soft-panel p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                <Mail size={16} aria-hidden="true" />
                문의
              </h2>
              {contactLinks.map((link) => (
                <a key={`${link.label}-${link.href}`} href={link.href} className="mt-2 block wrap-anywhere text-sm text-[var(--app-text)] underline underline-offset-2">
                  {/^mail$/i.test(link.label) ? '메일로 문의' : link.label}
                </a>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
