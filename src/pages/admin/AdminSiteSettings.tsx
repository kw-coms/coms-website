import { useEffect, useState } from 'react'
import {
  defaultSiteSettings,
  getAdminSiteSettings,
  getClubRoom,
  publishSiteSettings,
  updateClubRoom,
  type SiteSettings,
} from '../../services/siteSettingsApi'
import { showToast } from '../../components/common/Toast'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import ErrorState from '../../components/common/ErrorState'

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

function ClubRoomAdminCard() {
  const [doorCode, setDoorCode] = useState('')
  // True only after a successful GET. A failed load used to unlock the form with an empty
  // field, and 저장 then wiped the stored code.
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Reading the code and changing it are separate permissions. A role that may change it but
  // not read it gets a 403 here; that is an answer, not a failed load, so the field stays
  // usable — it just starts empty and will not save empty.
  const [viewDenied, setViewDenied] = useState(false)
  const [saving, setSaving] = useState(false)

  const applyLoadFailure = (err) => {
    if (err?.status === 403) {
      setViewDenied(true)
      setLoaded(true)
      return
    }
    setLoadError(err.message || '동아리방 비밀번호를 불러오지 못했습니다.')
  }

  useEffect(() => {
    let mounted = true
    getClubRoom()
      .then((data) => { if (mounted) { setDoorCode(data?.doorCode || ''); setLoaded(true) } })
      .catch((err) => { if (mounted) applyLoadFailure(err) })
    return () => { mounted = false }
  }, [])

  const retryLoad = async () => {
    setLoadError('')
    try {
      const data = await getClubRoom()
      setDoorCode(data?.doorCode || '')
      setLoaded(true)
    } catch (err) {
      applyLoadFailure(err)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    if (!loaded) return
    if (viewDenied && !doorCode.trim()) {
      showToast({ message: '새 비밀번호를 입력해주세요. 현재 값을 볼 수 없는 상태에서는 빈 값으로 저장할 수 없습니다.', tone: 'error' })
      return
    }
    setSaving(true)
    try {
      const saved = await updateClubRoom(doorCode.trim())
      setDoorCode(saved?.doorCode || '')
      showToast({ message: '동아리방 비밀번호가 저장되었습니다.' })
    } catch (err) {
      showToast({ message: err.message || '저장 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
      <h2 className="text-base font-bold text-[var(--theme-body-dark)]">동아리방 비밀번호</h2>
      <p className="mt-1 text-sm text-[var(--theme-body-muted)]">
        회원(준회원 제외)에게 설정 페이지에서 표시됩니다. 비우고 저장하면 표시가 사라집니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={doorCode}
          onChange={(event) => setDoorCode(event.target.value)}
          maxLength={60}
          placeholder={loaded ? '예: 1234' : (loadError ? '불러오지 못함' : '불러오는 중...')}
          disabled={!loaded || saving}
          className="w-48 rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 font-mono text-sm font-bold tracking-widest text-[var(--theme-body-dark)]"
        />
        <button
          type="submit"
          disabled={!loaded || saving}
          className="rounded-full bg-[var(--app-accent)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--app-accent-hover)] disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
      {viewDenied && (
        <p className="mt-3 text-xs leading-5 text-[var(--theme-body-muted)]">
          현재 비밀번호를 볼 권한이 없어 값이 표시되지 않습니다. 새 값을 입력해 저장하면 기존 비밀번호가 바뀝니다.
        </p>
      )}
      {loadError && (
        <div role="alert" className="mt-3">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">
            현재 비밀번호를 불러오지 못한 상태에서 저장하면 기존 비밀번호가 지워질 수 있어 저장을 막았습니다.
          </p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-2 rounded-full border border-[var(--app-hairline)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/60"
          >
            다시 불러오기
          </button>
        </div>
      )}
    </form>
  )
}

export default function AdminSiteSettings() {
  const [current, setCurrent] = useState<SiteSettings | null>(null)
  const [form, setForm] = useState<SiteSettings>(defaultSiteSettings)
  const [contactText, setContactText] = useState(linksToText(defaultSiteSettings))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
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
      .catch((err) => { if (mounted) setLoadError(err.message || '사이트 설정을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const retryLoad = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const settings = await getAdminSiteSettings()
      setCurrent(settings)
      setForm(settings)
      setContactText(linksToText(settings))
    } catch (err) {
      setLoadError(err.message || '사이트 설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

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

  // The form starts from the built-in defaults, so after a failed load 게시하기 would publish
  // those over the stored copy. Offer a retry instead of the form until a load has succeeded.
  if (!current) {
    return (
      <div className="space-y-5">
        <ClubRoomAdminCard />
        <ErrorState
          title="사이트 문구를 불러오지 못했습니다."
          message={`${loadError} 현재 게시된 문구를 불러온 뒤에만 편집하고 게시할 수 있습니다.`}
          onRetry={retryLoad}
          retryLabel="다시 불러오기"
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ClubRoomAdminCard />
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
