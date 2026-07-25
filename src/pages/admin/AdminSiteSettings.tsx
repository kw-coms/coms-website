import { useEffect, useState } from 'react'
import {
  defaultSiteSettings,
  getAdminSiteSettings,
  publishSiteSettings,
  type SiteSettings,
} from '../../services/siteSettingsApi'
import { showToast } from '../../components/common/Toast'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

function linksToText(settings: SiteSettings) {
  return settings.contactLinks.map((link) => `${link.label} | ${link.href}`).join('\n')
}

function textToLinks(value: string) {
  return value
    .split('\n')
    .map((line) => {
      const [label, ...hrefParts] = line.split('|')
      return { label: label?.trim() || '', href: hrefParts.join('|').trim() }
    })
    .filter((link) => link.label && link.href)
}

export default function AdminSiteSettings() {
  const [current, setCurrent] = useState<SiteSettings | null>(null)
  const [form, setForm] = useState<SiteSettings>(defaultSiteSettings)
  const [contactText, setContactText] = useState(linksToText(defaultSiteSettings))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    getAdminSiteSettings()
      .then((settings) => {
        if (!mounted) return
        setCurrent(settings)
        setForm(settings)
        setContactText(linksToText(settings))
      })
      .catch((err) => { if (mounted) setError(err.message || '사이트 설정을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const update = (field: keyof SiteSettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const published = await publishSiteSettings({ ...form, contactLinks: textToLinks(contactText) })
      setCurrent(published)
      setForm(published)
      setContactText(linksToText(published))
      showToast({ message: '사이트 문구를 게시했습니다.', tone: 'success' })
    } catch (err) {
      setError(err.message || '사이트 문구를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SkeletonGroup label="사이트 설정을 불러오는 중">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SkeletonGroup>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">사이트 문구 관리</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          홈 첫 화면과 모집 공지에 노출되는 운영 문구만 관리합니다.
        </p>
      </div>

      {current && (
        <section className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
          <p className="text-sm font-semibold text-[var(--theme-body-dark)]">현재 게시값</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-[var(--theme-body-muted)]">학기 라벨</dt>
              <dd className="mt-1 text-[var(--theme-body-dark)]">{current.semesterLabel}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--theme-body-muted)]">모집 상태</dt>
              <dd className="mt-1 text-[var(--theme-body-dark)]">{current.recruitmentStatus}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-[var(--theme-body-muted)]">홈 문구</dt>
              <dd className="mt-1 text-[var(--theme-body-dark)]">{current.homeHeroCopy}</dd>
            </div>
          </dl>
        </section>
      )}

      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">게시 전 미리보기</p>
        <div className="mt-3 rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
          <p className="text-xs font-bold text-[var(--app-accent-text)]">{form.semesterLabel || defaultSiteSettings.semesterLabel}</p>
          <h3 className="mt-2 text-2xl font-black text-[var(--theme-body-dark)]">{form.homeHeroTitle || defaultSiteSettings.homeHeroTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">{form.homeHeroCopy || defaultSiteSettings.homeHeroCopy}</p>
          <p className="mt-3 text-sm font-semibold text-[var(--theme-body-dark)]">
            {form.recruitmentStatus || defaultSiteSettings.recruitmentStatus} · {form.recruitmentPeriod || defaultSiteSettings.recruitmentPeriod}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--theme-body-dark)]">
            학기 라벨
            <input value={form.semesterLabel} onChange={(e) => update('semesterLabel', e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-sm font-semibold text-[var(--theme-body-dark)]">
            모집 상태
            <input value={form.recruitmentStatus} onChange={(e) => update('recruitmentStatus', e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-sm font-semibold text-[var(--theme-body-dark)] sm:col-span-2">
            모집 기간
            <input value={form.recruitmentPeriod} onChange={(e) => update('recruitmentPeriod', e.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-sm font-semibold text-[var(--theme-body-dark)]">
            홈 제목
            <input value={form.homeHeroTitle} onChange={(e) => update('homeHeroTitle', e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-sm font-semibold text-[var(--theme-body-dark)] sm:col-span-2">
            홈 보조 문구
            <textarea value={form.homeHeroCopy} onChange={(e) => update('homeHeroCopy', e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
          </label>
          <label className="text-sm font-semibold text-[var(--theme-body-dark)] sm:col-span-2">
            문의 링크
            <textarea value={contactText} onChange={(e) => setContactText(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none" />
            <span className="mt-1 block text-xs font-medium text-[var(--theme-body-muted)]">한 줄에 하나씩 `라벨 | 링크` 형식으로 입력합니다.</span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={saving} className="shape-cut-sm mt-4 bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50">
          {saving ? '게시 중...' : '게시하기'}
        </button>
      </form>
    </div>
  )
}
