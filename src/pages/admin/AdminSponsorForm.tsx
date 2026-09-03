import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { showToast } from '../../components/common/Toast'
import { sponsorImageSrc, uploadSponsorImage, type SponsorTier } from '../../services/sponsorApi'
import type { SponsorFormValue } from './sponsorFormUtils'

const fieldClass = 'mt-1 w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none'
const labelClass = 'text-sm font-semibold text-[var(--theme-body-dark)]'

/** 후원자 추가/수정 폼. 저장은 부모가 담당하고, 로고 업로드만 여기서 직접 처리한다. */
export default function AdminSponsorForm({ value, tiers, saving, onChange, onSubmit, onCancel }: {
  value: SponsorFormValue
  tiers: SponsorTier[]
  saving: boolean
  onChange: (next: SponsorFormValue) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const update = (patch: Partial<SponsorFormValue>) => onChange({ ...value, ...patch })

  const pickLogo = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadSponsorImage(file)
      update({ logoImageId: uploaded.id, logoUrl: uploaded.url })
    } catch (err) {
      showToast({ message: err.message || '로고 업로드에 실패했습니다.', tone: 'error' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onSubmit() }}
      className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          이름
          <input
            value={value.name}
            onChange={(event) => update({ name: event.target.value })}
            maxLength={80}
            required
            placeholder="후원자 또는 후원사 이름"
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          등급
          <select value={value.tierId} onChange={(event) => update({ tierId: event.target.value })} className={fieldClass}>
            <option value="">등급 없음</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>{tier.name}</option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2">
          <p className={labelClass}>로고</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {value.logoUrl ? (
              <img
                src={sponsorImageSrc(value.logoUrl)}
                alt="로고 미리보기"
                className="size-16 rounded-lg border border-[var(--app-hairline)] bg-white object-contain p-1"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-[var(--app-hairline)] text-xs font-semibold text-[var(--theme-body-muted)]">
                없음
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => pickLogo(event.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--theme-body-dark)] disabled:opacity-50"
            >
              <ImagePlus size={13} aria-hidden="true" />
              {uploading ? '업로드 중...' : '로고 올리기'}
            </button>
            {value.logoImageId && (
              <button
                type="button"
                onClick={() => update({ logoImageId: null, logoUrl: null })}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--app-hairline)] bg-white px-3 py-1.5 text-xs font-bold text-rose-600"
              >
                <X size={12} aria-hidden="true" />
                제거
              </button>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-[var(--theme-body-muted)]">JPG, PNG, GIF, WebP · 5MB 이하</p>
        </div>

        <label className={`${labelClass} sm:col-span-2`}>
          링크
          <input
            value={value.linkUrl}
            onChange={(event) => update({ linkUrl: event.target.value })}
            maxLength={500}
            placeholder="https://example.com"
            className={fieldClass}
          />
        </label>

        <label className={`${labelClass} sm:col-span-2`}>
          소개
          <textarea
            value={value.description}
            onChange={(event) => update({ description: event.target.value })}
            rows={3}
            placeholder="후원자 소개를 짧게 적어주세요."
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          금액 메모 <span className="font-bold text-rose-600">(비공개)</span>
          <input
            value={value.amountNote}
            onChange={(event) => update({ amountNote: event.target.value })}
            maxLength={120}
            placeholder="예: 2026-1학기 300,000원"
            className={fieldClass}
          />
          <span className="mt-1 block text-xs font-medium text-[var(--theme-body-muted)]">
            회장만 볼 수 있고 공개 페이지에는 절대 나가지 않습니다.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            후원 시작
            <input type="date" value={value.sinceDate} onChange={(event) => update({ sinceDate: event.target.value })} className={fieldClass} />
          </label>
          <label className={labelClass}>
            후원 종료
            <input type="date" value={value.untilDate} onChange={(event) => update({ untilDate: event.target.value })} className={fieldClass} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-body-dark)]">
          <input type="checkbox" checked={value.anonymous} onChange={(event) => update({ anonymous: event.target.checked })} />
          익명 후원 (이름·로고·링크를 공개하지 않음)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-body-dark)]">
          <input type="checkbox" checked={value.visible} onChange={(event) => update({ visible: event.target.checked })} />
          공개 페이지에 표시
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="apple-action-secondary px-4 py-2 text-sm">
          취소
        </button>
      </div>
    </form>
  )
}
