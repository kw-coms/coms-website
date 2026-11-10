import { recruitFactRows, RECRUIT_FACTS } from '../data/recruitFacts'

/** The facts a prospective member asks first. `extra` rows (site settings) come after the fixed ones. */
export default function RecruitFacts({ extra = [] }: { extra?: { label: string; value: string }[] }) {
  return (
    <section aria-labelledby="recruit-facts-title" data-testid="recruit-facts" className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-5">
      <h2 id="recruit-facts-title" className="text-lg font-bold text-[var(--app-text)]">{RECRUIT_FACTS.headline}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {[...recruitFactRows, ...extra].map(({ label, value }) => (
          <div key={label} className="flex gap-3">
            <dt className="w-16 shrink-0 font-semibold text-[var(--app-muted)]">{label}</dt>
            <dd className="min-w-0 text-[var(--app-text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
