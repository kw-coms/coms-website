import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, HeartHandshake, Mail } from 'lucide-react'
import { queryKeys } from '../services/queryKeys'
import { getSponsorPage, listSponsors, sponsorImageSrc } from '../services/sponsorApi'
import {
  DEFAULT_SPONSOR_ACCENT,
  defaultSponsorPageSettings,
  sponsorDisplayName,
  sponsorPeriodLabel,
  visibleSponsorGroups,
  type SponsorSummary,
  type SponsorTierGroup,
} from '../utils/sponsors'
import { renderRichBody } from '../components/richEditor/renderRichBody'
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton'
import ErrorState from '../components/common/ErrorState'
import { isSafeUrl } from '../utils/sanitizeHtml'
import '../styles/site-pages.css'

/** Text in an admin-chosen colour is pulled 70% toward the theme's text colour so it keeps AA contrast on either background. */
const readable = (color: string) => `color-mix(in srgb, ${color} 30%, var(--app-text))`

/**
 * 후원자 공개 페이지. Logged-out visitors see exactly what members see: the API
 * behind it is permitAll and the payload already omits the 금액 메모 and anonymises
 * the sponsors who asked for it.
 *
 * <p>The admin-chosen accent colour is injected as a scoped CSS custom property, never
 * as raw CSS text, and only after {@code normalizeAccentColor} has confirmed it is a #hex.
 * The default accent is the site's own (so every accent colour works); a colour the admin picked
 * only ever fills shapes and borders, text stays on theme tokens.
 */
export default function Sponsors() {
  const listQuery = useQuery({ queryKey: queryKeys.sponsors.list(), queryFn: listSponsors })
  const pageQuery = useQuery({ queryKey: queryKeys.sponsors.page(), queryFn: getSponsorPage })

  const settings = pageQuery.data?.settings ?? defaultSponsorPageSettings
  const groups = visibleSponsorGroups(listQuery.data)
  const sponsorCount = groups.reduce((total, group) => total + group.sponsors.length, 0)
  const bannerUrl = sponsorImageSrc(pageQuery.data?.bannerImageUrl)
  const accent = settings.accentColor === DEFAULT_SPONSOR_ACCENT ? 'var(--app-accent)' : settings.accentColor
  const accentStyle = {
    '--sponsor-accent': accent,
    '--sponsor-accent-text': accent === 'var(--app-accent)' ? 'var(--app-accent-text)' : readable(accent),
  } as CSSProperties

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
    <div className="space-y-10 pb-10 pt-2" style={accentStyle}>
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
        <p className="mx-auto flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-[var(--app-hairline)] bg-[color-mix(in_srgb,var(--sponsor-accent)_8%,var(--app-surface))] px-5 py-4 text-center text-[15px] font-semibold leading-7 text-[var(--app-text)]">
          <HeartHandshake size={18} className="shrink-0 text-[var(--sponsor-accent-text)]" aria-hidden="true" />
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
    <header>
      <div className="site-head">
        <div>
          <h1>{title}</h1>
          <p className="site-head-lead">{subtitle}</p>
        </div>
        {counts && (
          <dl className="site-stats">
            <div><dt>총 후원자 수</dt><dd>{counts.sponsors.toLocaleString('ko-KR')}명</dd></div>
            <div><dt>후원 등급</dt><dd>{counts.tiers}개</dd></div>
          </dl>
        )}
      </div>
      {bannerUrl && (
        <img src={bannerUrl} alt="" aria-hidden="true" className="mt-8 aspect-[16/5] w-full rounded-3xl border border-[var(--app-hairline)] object-cover" />
      )}
    </header>
  )
}

function TierSection({ group, layout, showTierLabels }: {
  group: SponsorTierGroup
  layout: 'grid' | 'list'
  showTierLabels: boolean
}) {
  const tierColor = group.color || 'var(--sponsor-accent)'
  // One or two sponsors would sit alone in a wide empty grid: keep the admin's layout, but size the
  // columns to the count and centre them.
  const sparse = layout === 'grid' && group.sponsors.length < 3
  return (
    <section>
      {showTierLabels && group.name && (
        <div className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 ${sparse ? 'justify-center text-center' : ''}`}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black"
            style={{
              color: readable(tierColor),
              borderColor: `color-mix(in srgb, ${tierColor} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${tierColor} 12%, transparent)`,
            }}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: tierColor }} aria-hidden="true" />
            {group.name}
          </span>
          {group.description && (
            <p className="text-[13px] font-semibold text-[var(--app-muted)]">{group.description}</p>
          )}
        </div>
      )}
      <ul
        className={layout === 'list' ? 'flex flex-col gap-3' : sparse ? 'grid gap-3 sm:justify-center sm:[grid-template-columns:repeat(var(--n),minmax(0,22rem))]' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}
        style={sparse ? ({ '--n': group.sponsors.length } as CSSProperties) : undefined}
      >
        {group.sponsors.map((sponsor, index) => (
          <li key={sponsor.anonymous ? `anon-${index}` : sponsor.id}>
            <SponsorCard sponsor={sponsor} layout={layout} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SponsorCard({ sponsor, layout }: {
  sponsor: SponsorSummary
  layout: 'grid' | 'list'
}) {
  const name = sponsorDisplayName(sponsor)
  const period = sponsorPeriodLabel(sponsor.sinceDate, sponsor.untilDate)
  const logoUrl = sponsorImageSrc(sponsor.logoUrl)
  // 익명 후원자에게는 외부 링크가 없고, 남은 링크도 http(s) 인지 한 번 더 확인한다.
  const href = !sponsor.anonymous && sponsor.linkUrl && isSafeUrl(sponsor.linkUrl) ? sponsor.linkUrl : ''

  return (
    <article className={`flex h-full gap-4 rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4 transition hover:border-[color-mix(in_srgb,var(--sponsor-accent)_50%,var(--app-hairline))] ${layout === 'list' ? 'items-center' : 'flex-col items-start sm:p-5'}`}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt={`${name} 로고`}
          loading="lazy"
          className="size-14 shrink-0 rounded-xl border border-[var(--app-hairline)] bg-white object-contain p-1.5"
        />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-[var(--app-text)]">{name}</h3>
        {sponsor.description && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] font-medium leading-6 text-[var(--app-muted)]">
            {sponsor.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {period && <span className="text-xs font-semibold text-[var(--app-subtle)]">{period}</span>}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--sponsor-accent-text)] underline-offset-2 hover:underline"
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
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sponsor-accent)] bg-[color-mix(in_srgb,var(--sponsor-accent)_16%,transparent)] px-4 py-2 text-xs font-bold text-[var(--app-text)] transition hover:bg-[color-mix(in_srgb,var(--sponsor-accent)_26%,transparent)]"
          >
            <Mail size={13} className="text-[var(--sponsor-accent-text)]" aria-hidden="true" />
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
