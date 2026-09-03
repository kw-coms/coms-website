import { useMemo, useRef, useState } from 'react'
import { ExternalLink, ImagePlus, X } from 'lucide-react'
import RichBodyEditor from '../../components/richEditor/RichBodyEditor'
import { URL_ONLY_RICH_FEATURES } from '../../components/richEditor/richBodyFeatures'
import { serializeRichBody } from '../../components/richEditor/serializeRichBody'
import { parsePostBlocks } from '../community/postEditorUtils'
import { fetchLinkPreview, searchYoutubeVideos } from '../../services/communityApi'
import { showToast } from '../../components/common/Toast'
import { saveSponsorPageSettings, sponsorImageSrc, uploadSponsorImage } from '../../services/sponsorApi'
import { normalizeAccentColor, type SponsorPageSettings } from '../../utils/sponsors'

const fieldClass = 'mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none'
const labelClass = 'text-sm font-semibold text-[var(--theme-body-dark)]'

/**
 * 페이지 디자인 패널. 소개글만 공지와 같은 리치 에디터(블록 JSON)를 쓰고, 후원 안내
 * 본문은 서버 sanitizer 를 그대로 통과하는 일반 텍스트다 — 짧은 안내문에 두 번째
 * 에디터 인스턴스를 띄울 만큼의 값이 없다.
 */
export default function AdminSponsorPageDesign({ settings, onSaved }: {
  settings: SponsorPageSettings
  onSaved: (next: SponsorPageSettings) => void
}) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const introEditorRef = useRef(null)
  // 마운트 시 한 번만 블록으로 변환한다 — 매 렌더마다 다시 만들면 편집 중인 내용이 날아간다.
  const introBlocks = useMemo(() => parsePostBlocks({ content: settings.introHtml }), [])  // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<SponsorPageSettings>) => setForm((prev) => ({ ...prev, ...patch }))
  const updateHowTo = (patch: Partial<SponsorPageSettings['howToSection']>) =>
    setForm((prev) => ({ ...prev, howToSection: { ...prev.howToSection, ...patch } }))

  const pickBanner = async (file?: File | null) => {
    if (!file) return
    setUploadingBanner(true)
    try {
      const uploaded = await uploadSponsorImage(file)
      update({ bannerImageId: uploaded.id })
    } catch (err) {
      showToast({ message: err.message || '배너 업로드에 실패했습니다.', tone: 'error' })
    } finally {
      setUploadingBanner(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const introHtml = serializeRichBody(introEditorRef.current?.getBlocks() || [])
      const saved = await saveSponsorPageSettings({ ...form, introHtml })
      setForm(saved)
      onSaved(saved)
      showToast({ message: '후원자 페이지 설정을 저장했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '설정을 저장하지 못했습니다.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const bannerUrl = form.bannerImageId ? sponsorImageSrc(`/api/sponsors/images/${form.bannerImageId}`) : ''

  return (
    <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--theme-body-dark)]">페이지 디자인</h3>
        <a
          href="/sponsors"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--app-hairline)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--theme-body-dark)]"
        >
          미리보기
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          히어로 제목
          <input value={form.heroTitle} onChange={(e) => update({ heroTitle: e.target.value })} maxLength={80} className={fieldClass} />
        </label>
        <label className={labelClass}>
          히어로 보조 문구
          <input value={form.heroSubtitle} onChange={(e) => update({ heroSubtitle: e.target.value })} maxLength={200} className={fieldClass} />
        </label>

        <div className="sm:col-span-2">
          <p className={labelClass}>배너 이미지</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {bannerUrl ? (
              <img src={bannerUrl} alt="배너 미리보기" className="h-20 w-40 rounded-lg border border-[var(--app-hairline)] object-cover" />
            ) : (
              <span className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-[var(--app-hairline)] text-xs font-semibold text-[var(--theme-body-muted)]">
                강조 색 그라디언트 사용
              </span>
            )}
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => pickBanner(e.target.files?.[0])}
              className="hidden"
            />
            <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">
              <ImagePlus size={13} aria-hidden="true" />
              {uploadingBanner ? '업로드 중...' : '배너 올리기'}
            </button>
            {form.bannerImageId && (
              <button type="button" onClick={() => update({ bannerImageId: null })} className="inline-flex items-center gap-1 rounded-full border border-[var(--app-hairline)] bg-white px-3 py-1.5 text-xs font-bold text-rose-600">
                <X size={12} aria-hidden="true" />
                제거
              </button>
            )}
          </div>
        </div>

        <label className={labelClass}>
          강조 색
          <input
            type="color"
            value={normalizeAccentColor(form.accentColor)}
            onChange={(e) => update({ accentColor: e.target.value })}
            className="mt-1 h-10 w-24 cursor-pointer rounded-lg border border-[var(--app-hairline)] bg-white"
          />
        </label>

        <fieldset>
          <legend className={labelClass}>레이아웃</legend>
          <div className="mt-1 flex gap-4">
            {(['grid', 'list'] as const).map((layout) => (
              <label key={layout} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--theme-body-dark)]">
                <input
                  type="radio"
                  name="sponsor-layout"
                  value={layout}
                  checked={form.layout === layout}
                  onChange={() => update({ layout })}
                />
                {layout === 'grid' ? '그리드' : '리스트'}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-body-dark)]">
          <input type="checkbox" checked={form.showTierLabels} onChange={(e) => update({ showTierLabels: e.target.checked })} />
          등급 라벨 표시
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-body-dark)]">
          <input type="checkbox" checked={form.showCounts} onChange={(e) => update({ showCounts: e.target.checked })} />
          총 후원자 수 표시
        </label>

        <div className="sm:col-span-2">
          <p className={labelClass}>소개글</p>
          <div className="mt-1">
            <RichBodyEditor
              initialBlocks={introBlocks}
              apiRef={introEditorRef}
              features={URL_ONLY_RICH_FEATURES}
              searchYoutube={searchYoutubeVideos}
              fetchLinkPreview={fetchLinkPreview}
            />
          </div>
        </div>

        <label className={labelClass}>
          후원 안내 제목
          <input value={form.howToSection.title} onChange={(e) => updateHowTo({ title: e.target.value })} maxLength={80} className={fieldClass} />
        </label>
        <label className={labelClass}>
          계좌·납부 안내
          <input value={form.howToSection.bankNote} onChange={(e) => updateHowTo({ bankNote: e.target.value })} maxLength={200} className={fieldClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          후원 안내 본문
          <textarea value={form.howToSection.bodyHtml} onChange={(e) => updateHowTo({ bodyHtml: e.target.value })} rows={4} className={fieldClass} />
        </label>
        <label className={labelClass}>
          문의 이메일
          <input value={form.howToSection.contactEmail} onChange={(e) => updateHowTo({ contactEmail: e.target.value })} maxLength={120} placeholder="kwcoms69@gmail.com" className={fieldClass} />
        </label>
        <label className={labelClass}>
          문의 링크
          <input value={form.howToSection.contactLink} onChange={(e) => updateHowTo({ contactLink: e.target.value })} maxLength={500} placeholder="https://" className={fieldClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          감사 문구
          <input value={form.thankYouMessage} onChange={(e) => update({ thankYouMessage: e.target.value })} maxLength={200} className={fieldClass} />
        </label>
      </div>

      <button type="submit" disabled={saving} className="shape-cut-sm mt-4 bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50">
        {saving ? '저장 중...' : '설정 저장'}
      </button>
    </form>
  )
}
