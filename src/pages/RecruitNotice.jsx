import { ArrowLeft, CalendarDays, CheckCircle2, Mail, PenLine, Rocket, Users, X } from 'lucide-react'

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

export default function RecruitNotice({ onBack, onApply }) {
  return (
    <div className="w-full space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white"
      >
        <ArrowLeft size={15} />
        이전 화면으로
      </button>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white text-[#1d1d1f] shadow-[0_24px_70px_rgba(0,0,0,0.1)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 bg-linear-to-br from-[#ecfff5] via-white to-[#f5f5f7] px-6 py-7 sm:px-8">
          <div>
            <p className="text-sm font-semibold text-[#0066cc]">Recruit Notice</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">COM&apos;s 신입 부원 모집 공지</h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold text-[#6e6e73]">광운대학교 중앙 컴퓨터 학술동아리</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-full border border-black/10 bg-white/80 p-2 text-[#1d1d1f] transition hover:bg-white"
            aria-label="이전 화면으로"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          <article className="space-y-8 p-6 sm:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
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

            <div className="grid gap-3 md:grid-cols-3">
              {recruitDetails.map(({ title, icon: Icon, body }) => (
                <div key={title} className="rounded-lg border border-black/10 bg-[#f5f5f7] p-4">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Icon size={19} />
                  </div>
                  <h2 className="text-base font-black">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">{body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/80 p-5">
              <h2 className="text-lg font-black text-emerald-900">지원 절차</h2>
              <div className="mt-4 space-y-3">
                {processSteps.map((step) => (
                  <div key={step} className="flex gap-3 text-sm leading-6 text-emerald-950/80">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <aside className="flex flex-col justify-between gap-8 bg-[#f5f5f7] p-6 text-[#1d1d1f] sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-[#0066cc]">Welcome</p>
                <p className="mt-4 text-sm leading-7 text-[#6e6e73]">
                  COM&apos;s는 혼자서는 막막했던 공부를 함께 이어가는 공간입니다. 기초부터 차근차근 시작해도 좋고,
                  이미 만든 것이 있다면 더 큰 프로젝트로 확장해도 좋습니다.
                </p>
              </div>

              <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
                  <Mail size={16} />
                  문의
                </div>
                <a href="mailto:kwcoms69@gmail.com" className="mt-2 block break-all text-sm text-[#0066cc] hover:text-[#0077ed]">
                  kwcoms69@gmail.com
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={onApply}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0071e3] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#0077ed]"
            >
              <PenLine size={17} />
              지원서 작성하기
            </button>
          </aside>
        </div>
      </section>
    </div>
  )
}
