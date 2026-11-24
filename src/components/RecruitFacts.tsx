import { recruitFactRows } from '../data/recruitFacts'
import { defaultSiteSettings, type SiteSettings } from '../services/siteSettingsApi'

/** The facts a prospective member asks first. `extra` rows come after them. */
export default function RecruitFacts({ extra = [], settings = defaultSiteSettings }: { extra?: { label: string; value: string }[]; settings?: SiteSettings }) {
  return (
    <section aria-labelledby="recruit-facts-title" data-testid="recruit-facts" className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5">
      <h2 id="recruit-facts-title" className="text-lg font-bold text-[var(--app-text)]">{settings.recruitHeadline}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {[...recruitFactRows(settings), ...extra].map(({ label, value }) => (
          <div key={label} className="flex gap-3">
            <dt className="w-16 shrink-0 font-semibold text-[var(--app-muted)]">{label}</dt>
            <dd className="min-w-0 text-[var(--app-text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
