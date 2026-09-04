import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, HeartHandshake, Mail } from 'lucide-react'
import { queryKeys } from '../services/queryKeys'
import { getSponsorPage, listSponsors, sponsorImageSrc } from '../services/sponsorApi'
import {
  defaultSponsorPageSettings,
  sponsorDisplayName,
  sponsorInitial,
  sponsorPeriodLabel,
  visibleSponsorGroups,
  type SponsorSummary,
  type SponsorTierGroup,
} from '../utils/sponsors'
import { renderRichBody } from '../components/richEditor/renderRichBody'
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton'
import ErrorState from '../components/common/ErrorState'
import { isSafeUrl } from '../utils/sanitizeHtml'

/**
 * 후원자 공개 페이지. Logged-out visitors see exactly what members see: the API
 * behind it is permitAll and the payload already omits the 금액 메모 and anonymises
 * the sponsors who asked for it.
 *
 * <p>The admin-chosen accent colour is injected as a scoped CSS custom property, never
 * as raw CSS text, and only after {@code normalizeAccentColor} has confirmed it is a #hex.
 */
export default function Sponsors() {
  const listQuery = useQuery({ queryKey: queryKeys.sponsors.list(), queryFn: listSponsors })
  const pageQuery = useQuery({ queryKey: queryKeys.sponsors.page(), queryFn: getSponsorPage })

  const settings = pageQuery.data?.settings ?? defaultSponsorPageSettings
  const groups = visibleSponsorGroups(listQuery.data)
  const sponsorCount = groups.reduce((total, group) => total + group.sponsors.length, 0)
  const bannerUrl = sponsorImageSrc(pageQuery.data?.bannerImageUrl)
  const accentStyle = { '--sponsor-accent': settings.accentColor } as CSSProperties

  if (listQuery.isLoading || pageQuery.isLoading) {
    return (
      <SkeletonGroup label="후원자 정보를 불러오는 중">
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </SkeletonGroup>
    )
  }

  if (listQuery.isError || pageQuery.isError) {
    return (
      <ErrorState
        title="후원자 정보를 불러오지 못했습니다."
        message="잠시 후 다시 시도해주세요."
        onRetry={() => { listQuery.refetch(); pageQuery.refetch() }}
      />
    )
  }

  return (
    <div className="space-y-10 pb-10" style={accentStyle}>
      <SponsorHero
        title={settings.heroTitle}
        subtitle={settings.heroSubtitle}
        bannerUrl={bannerUrl}
        counts={settings.showCounts ? { sponsors: sponsorCount, tiers: groups.length } : null}
      />

      {settings.introHtml && (
        <section className="apple-soft-panel px-5 py-6 text-[15px] leading-7 text-[var(--app-text)] sm:px-7">
          {renderRichBody(settings.introHtml, (plain) => (
            <p className="whitespace-pre-line">{plain}</p>
          ))}
        </section>
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--app-hairline)] px-5 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">
          아직 등록된 후원자가 없습니다.
        </p>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <TierSection
              key={group.id ?? 'untiered'}
              group={group}
              layout={settings.layout}
              showTierLabels={settings.showTierLabels}
            />
          ))}
        </div>
      )}

      <HowToSection howTo={settings.howToSection} />

      {settings.thankYouMessage && (
        <p className="text-center text-sm font-semibold leading-7 text-[var(--app-muted)]">
          {settings.thankYouMessage}
        </p>
      )}
    </div>
  )
}

function SponsorHero({ title, subtitle, bannerUrl, counts }: {
  title: string
  subtitle: string
  bannerUrl: string
  counts: { sponsors: number; tiers: number } | null
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--app-hairline)] bg-[var(--app-surface)]">
      {bannerUrl ? (
        <>
          <img src={bannerUrl} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-b from-black/25 via-black/45 to-black/70" />
        </>
      ) : (
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'linear-gradient(135deg, color-mix(in srgb, var(--sponsor-accent) 82%, #000000) 0%, color-mix(in srgb, var(--sponsor-accent) 42%, #ffffff) 100%)',
          }}
        />
      )}
      <div className="relative z-10 px-6 py-14 text-center sm:px-10 sm:py-20">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
          <HeartHandshake size={13} aria-hidden="true" />
          Sponsors
        </span>
        <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/85 sm:text-base">{subtitle}</p>
        {counts && (
          <dl className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <HeroCount label="총 후원자 수" value={`${counts.sponsors.toLocaleString('ko-KR')}명`} />
            <HeroCount label="후원 등급" value={`${counts.tiers}개`} />
          </dl>
        )}
      </div>
    </section>
  )
}

function HeroCount({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full bg-white/15 px-4 py-2 text-white backdrop-blur-sm">
      <dt className="text-[11px] font-semibold text-white/75">{label}</dt>
      <dd className="text-sm font-black">{value}</dd>
    </div>
  )
}

function TierSection({ group, layout, showTierLabels }: {
  group: SponsorTierGroup
  layout: 'grid' | 'list'
  showTierLabels: boolean
}) {
  const tierColor = group.color || 'var(--sponsor-accent)'
  return (
    <section>
      {showTierLabels && group.name && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black"
            style={{
              color: tierColor,
              borderColor: `color-mix(in srgb, ${tierColor} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${tierColor} 12%, transparent)`,
            }}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: tierColor }} aria-hidden="true" />
            {group.name}
          </span>
          {group.description && (
            <p className="text-xs font-semibold text-[var(--app-muted)]">{group.description}</p>
          )}
        </div>
      )}
      <ul className={layout === 'list' ? 'flex flex-col gap-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
        {group.sponsors.map((sponsor, index) => (
          <li key={sponsor.anonymous ? `anon-${index}` : sponsor.id}>
            <SponsorCard sponsor={sponsor} tierColor={tierColor} layout={layout} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SponsorCard({ sponsor, tierColor, layout }: {
  sponsor: SponsorSummary
  tierColor: string
  layout: 'grid' | 'list'
}) {
  const name = sponsorDisplayName(sponsor)
  const period = sponsorPeriodLabel(sponsor.sinceDate, sponsor.untilDate)
  const logoUrl = sponsorImageSrc(sponsor.logoUrl)
  // 익명 후원자에게는 외부 링크가 없고, 남은 링크도 http(s) 인지 한 번 더 확인한다.
  const href = !sponsor.anonymous && sponsor.linkUrl && isSafeUrl(sponsor.linkUrl) ? sponsor.linkUrl : ''

  return (
    <article className={`flex h-full gap-4 rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4 transition hover:border-[color-mix(in_srgb,var(--sponsor-accent)_40%,transparent)] ${layout === 'list' ? 'items-center' : 'flex-col items-start sm:p-5'}`}>
      <div className={layout === 'list' ? 'shrink-0' : ''}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} 로고`}
            loading="lazy"
            className="size-14 rounded-xl border border-[var(--app-hairline)] bg-white object-contain p-1.5"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-xl text-xl font-black"
            style={{
              color: tierColor,
              backgroundColor: `color-mix(in srgb, ${tierColor} 14%, transparent)`,
            }}
          >
            {sponsorInitial(name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-[var(--app-text)]">{name}</h3>
        {sponsor.description && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] font-medium leading-6 text-[var(--app-muted)]">
            {sponsor.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {period && <span className="text-[11px] font-semibold text-[var(--app-subtle)]">{period}</span>}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--sponsor-accent)] hover:underline"
            >
              바로가기
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function HowToSection({ howTo }: { howTo: { title: string; bodyHtml: string; contactEmail: string; contactLink: string; bankNote: string } }) {
  const hasContent = howTo.bodyHtml || howTo.contactEmail || howTo.contactLink || howTo.bankNote
  if (!hasContent) return null
  const contactHref = howTo.contactLink && isSafeUrl(howTo.contactLink) ? howTo.contactLink : ''

  return (
    <section className="rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-5 py-6 sm:px-7">
      <h2 className="text-lg font-bold text-[var(--app-text)]">{howTo.title}</h2>
      {howTo.bodyHtml && (
        <div className="mt-3 text-[14px] font-medium leading-7 text-[var(--app-muted)]">
          {renderRichBody(howTo.bodyHtml, (plain) => (
            <p className="whitespace-pre-line">{plain}</p>
          ))}
        </div>
      )}
      {howTo.bankNote && (
        <p className="mt-3 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-[13px] font-semibold text-[var(--app-text)]">
          {howTo.bankNote}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {howTo.contactEmail && (
          <a
            href={`mailto:${howTo.contactEmail}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sponsor-accent)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
          >
            <Mail size={13} aria-hidden="true" />
            {howTo.contactEmail}
          </a>
        )}
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] transition hover:border-[var(--sponsor-accent)]"
          >
            후원 문의
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  )
}
