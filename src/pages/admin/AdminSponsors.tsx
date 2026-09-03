import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import Chip from '../../components/common/Chip'
import {
  createSponsor,
  deleteSponsor,
  exportSponsorsCsv,
  getAdminSponsorPageSettings,
  listAdminSponsorTiers,
  listAdminSponsors,
  reorderSponsors,
  sponsorImageSrc,
  updateSponsor,
  type SponsorAdminRow,
  type SponsorTier,
} from '../../services/sponsorApi'
import { defaultSponsorPageSettings, sponsorPeriodLabel, type SponsorPageSettings } from '../../utils/sponsors'
import AdminSponsorForm from './AdminSponsorForm'
import { sponsorFormPayload, sponsorFormValue, type SponsorFormValue } from './sponsorFormUtils'
import AdminSponsorTiers from './AdminSponsorTiers'
import AdminSponsorPageDesign from './AdminSponsorPageDesign'

/**
 * 후원자 관리 탭 — 회장(ADMIN) 전용. Admin.tsx 의 탭 id 'sponsors' 는 roleAccess 의
 * 부회장/임원 허용 목록에 없으므로 다른 등급에는 탭 자체가 보이지 않고, 서버도
 * /api/admin/sponsors/** 를 ADMIN 으로 잠근다.
 */
export default function AdminSponsors() {
  const [sponsors, setSponsors] = useState<SponsorAdminRow[]>([])
  const [tiers, setTiers] = useState<SponsorTier[]>([])
  const [settings, setSettings] = useState<SponsorPageSettings>(defaultSponsorPageSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<SponsorAdminRow | null>(null)
  const [form, setForm] = useState<SponsorFormValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([listAdminSponsors(), listAdminSponsorTiers(), getAdminSponsorPageSettings()])
      .then(([sponsorRows, tierRows, pageSettings]) => {
        if (!mounted) return
        setSponsors(sponsorRows)
        setTiers(tierRows)
        setSettings(pageSettings)
      })
      .catch((err) => { if (mounted) setError(err.message || '후원자 정보를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const openForm = (row: SponsorAdminRow | null) => {
    setEditing(row)
    setForm(sponsorFormValue(row))
  }

  const closeForm = () => {
    setEditing(null)
    setForm(null)
  }

  const submitForm = async () => {
    if (!form) return
    if (!form.name.trim()) { showToast({ message: '이름을 입력해주세요.', tone: 'error' }); return }
    setSaving(true)
    try {
      const payload = sponsorFormPayload(form)
      if (editing) await updateSponsor(editing.id, payload)
      else await createSponsor(payload)
      setSponsors(await listAdminSponsors())
      closeForm()
      showToast({ message: editing ? '후원자를 수정했습니다.' : '후원자를 추가했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '저장 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const removeSponsor = async (row: SponsorAdminRow) => {
    const ok = await confirmDialog({
      title: '후원자 삭제',
      message: `"${row.name}" 후원자를 삭제할까요? 되돌릴 수 없습니다.`,
      confirmText: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteSponsor(row.id)
      setSponsors(await listAdminSponsors())
      showToast({ message: '후원자를 삭제했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '삭제하지 못했습니다.', tone: 'error' })
    }
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...sponsors]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true)
    try {
      setSponsors(await reorderSponsors(next.map((row) => row.id)))
    } catch (err) {
      showToast({ message: err.message || '순서를 저장하지 못했습니다.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const downloadCsv = async () => {
    try {
      const blob = await exportSponsorsCsv()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'sponsors.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast({ message: err.message || 'CSV 내보내기에 실패했습니다.', tone: 'error' })
    }
  }

  if (loading) {
    return (
      <SkeletonGroup label="후원자 정보를 불러오는 중">
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SkeletonGroup>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">후원자 관리</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            공개 페이지 /sponsors 에 나가는 후원자 목록, 등급, 페이지 디자인을 관리합니다. 금액 메모는 이 화면에서만 보입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-white px-4 py-2 text-xs font-bold text-[var(--theme-body-dark)]">
            <Download size={13} aria-hidden="true" />
            CSV 내보내기
          </button>
          <button type="button" onClick={() => openForm(null)} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--app-accent)] px-4 py-2 text-xs font-bold text-white">
            <Plus size={13} aria-hidden="true" />
            후원자 추가
          </button>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {form && (
        <AdminSponsorForm
          value={form}
          tiers={tiers}
          saving={saving}
          onChange={setForm}
          onSubmit={submitForm}
          onCancel={closeForm}
        />
      )}

      <section className="overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-white/60">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-black/[0.04] text-xs font-bold text-[var(--theme-body-muted)]">
            <tr>
              <th scope="col" className="px-3 py-2">로고</th>
              <th scope="col" className="px-3 py-2">이름</th>
              <th scope="col" className="px-3 py-2">등급</th>
              <th scope="col" className="px-3 py-2">기간</th>
              <th scope="col" className="px-3 py-2">상태</th>
              <th scope="col" className="px-3 py-2">순서</th>
              <th scope="col" className="px-3 py-2">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-hairline)]">
            {sponsors.map((row, index) => (
              <tr key={row.id} className="text-[var(--theme-body-dark)]">
                <td className="px-3 py-2">
                  {row.logoUrl ? (
                    <img src={sponsorImageSrc(row.logoUrl)} alt="" className="size-9 rounded-md border border-[var(--app-hairline)] bg-white object-contain p-0.5" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-md bg-black/5 text-xs font-bold text-[var(--theme-body-muted)]">-</span>
                  )}
                </td>
                <td className="px-3 py-2 font-semibold">
                  {row.name}
                  {row.anonymous && <span className="ml-1.5 text-xs font-bold text-[var(--theme-body-muted)]">(익명)</span>}
                  {row.amountNote && <p className="text-xs font-medium text-[var(--theme-body-muted)]">{row.amountNote}</p>}
                </td>
                <td className="px-3 py-2 text-xs font-semibold">{row.tierName || '-'}</td>
                <td className="px-3 py-2 text-xs font-medium">{sponsorPeriodLabel(row.sinceDate, row.untilDate) || '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {!row.visible && <Chip variant="admin">숨김</Chip>}
                    {row.expired && <Chip variant="pinned">만료</Chip>}
                    {row.visible && !row.expired && <Chip variant="category">공개</Chip>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} className="rounded-full border border-[var(--app-hairline)] bg-white p-1 disabled:opacity-40" aria-label={`${row.name} 위로`}>
                      <ChevronUp size={13} />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={busy || index === sponsors.length - 1} className="rounded-full border border-[var(--app-hairline)] bg-white p-1 disabled:opacity-40" aria-label={`${row.name} 아래로`}>
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openForm(row)} className="rounded-full border border-[var(--app-hairline)] bg-white p-1.5" aria-label={`${row.name} 수정`}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => removeSponsor(row)} className="rounded-full border border-[var(--app-hairline)] bg-white p-1.5 text-rose-600" aria-label={`${row.name} 삭제`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sponsors.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm font-semibold text-[var(--theme-body-muted)]">
                  아직 등록된 후원자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <AdminSponsorTiers tiers={tiers} onChanged={setTiers} />
      <AdminSponsorPageDesign settings={settings} onSaved={setSettings} />
    </div>
  )
}
