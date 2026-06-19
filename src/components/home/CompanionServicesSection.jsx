import { ArrowUpRight } from 'lucide-react'
import { companionServices } from '../../data/homeContent.js'

function CompanionServicesSection() {
  return (
    <section className="bg-white px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
          <div>
            <p className="apple-eyebrow">Service launcher</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">COM&apos;s Apps</h2>
            <p className="apple-copy mt-4 max-w-xl text-lg">
              공식 웹사이트에서 동아리 주변 서비스로 바로 이동할 수 있게 묶었습니다. 활동, 팀 편성, 게임, 캠퍼스 유틸, 코딩 루틴을 한 흐름으로 이어갑니다.
            </p>
          </div>
          <div className="apple-soft-panel bg-[#f5f5f7] px-5 py-5">
            <p className="text-sm font-semibold text-[#1d1d1f]">개선 방향</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6e6e73]">
              월드컵과 티어표는 COMS 계정 기반 저장·공유를 사용합니다. 다음 단계로는 서비스별 운영 상태와 최근 활동 요약을 붙이면 생태계가 더 선명해집니다.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {companionServices.map((service) => (
            <a
              key={service.title}
              href={service.href}
              target="_blank"
              rel="noreferrer"
              className="apple-product-panel group flex min-h-64 flex-col px-6 py-6 text-left no-underline transition hover:-translate-y-0.5"
            >
              <p className="text-sm font-semibold text-[#0066cc]">{service.eyebrow}</p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#1d1d1f]">{service.title}</h3>
              <p className="mt-3 flex-1 text-sm font-medium leading-6 text-[#6e6e73]">{service.body}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#0066cc]">
                열기
                <ArrowUpRight size={15} aria-hidden="true" />
              </span>
              <span className="mt-3 truncate rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#86868b]">
                {service.domain}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export default CompanionServicesSection
