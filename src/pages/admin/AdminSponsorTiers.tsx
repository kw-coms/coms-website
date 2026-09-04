import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import {
  createSponsorTier,
  deleteSponsorTier,
  reorderSponsorTiers,
  updateSponsorTier,
  type SponsorTier,
} from '../../services/sponsorApi'

const fieldClass = 'w-full rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none'

/** 등급 관리 패널: 이름 / 색 / 설명 편집과 순서 변경. */
export default function AdminSponsorTiers({ tiers, onChanged }: {
  tiers: SponsorTier[]
  onChanged: (next: SponsorTier[]) => void
}) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#d4a017')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true)
    try {
      await action()
      showToast({ message: successMessage, tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '저장 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const addTier = async () => {
    if (!newName.trim()) { showToast({ message: '등급 이름을 입력해주세요.', tone: 'error' }); return }
    await run(async () => {
      await createSponsorTier({ name: newName.trim(), color: newColor })
      onChanged(await reorderSponsorTiers(tiers.map((tier) => tier.id)))
      setNewName('')
    }, '등급을 추가했습니다.')
  }

  const saveTier = async (tier: SponsorTier, patch: Partial<SponsorTier>) => {
    await run(async () => {
      await updateSponsorTier(tier.id, { name: tier.name, color: tier.color, description: tier.description, ...patch })
      onChanged(await reorderSponsorTiers(tiers.map((item) => item.id)))
    }, '등급을 저장했습니다.')
  }

  const removeTier = async (tier: SponsorTier) => {
    const ok = await confirmDialog({
      title: '등급 삭제',
      message: `"${tier.name}" 등급을 삭제할까요? 이 등급을 쓰는 후원자가 있으면 삭제할 수 없습니다.`,
      confirmText: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    await run(async () => {
      await deleteSponsorTier(tier.id)
      onChanged(await reorderSponsorTiers(tiers.filter((item) => item.id !== tier.id).map((item) => item.id)))
    }, '등급을 삭제했습니다.')
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...tiers]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await run(async () => { onChanged(await reorderSponsorTiers(next.map((tier) => tier.id))) }, '순서를 저장했습니다.')
  }

  return (
    <section className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
      <h3 className="text-base font-bold text-[var(--theme-body-dark)]">등급 관리</h3>
      <p className="mt-1 text-sm text-[var(--theme-body-muted)]">
        등급 색은 공개 페이지의 등급 칩 색으로 쓰입니다. 순서가 곧 페이지에서의 섹션 순서입니다.
      </p>

      <ul className="mt-3 space-y-2">
        {tiers.map((tier, index) => (
          <li key={tier.id} className="grid gap-2 rounded-lg border border-[var(--app-hairline)] bg-white p-3 sm:grid-cols-[10rem_3rem_1fr_auto] sm:items-center">
            <input
              defaultValue={tier.name}
              maxLength={40}
              onBlur={(event) => { if (event.target.value !== tier.name) saveTier(tier, { name: event.target.value }) }}
              className={fieldClass}
              aria-label={`${tier.name} 등급 이름`}
            />
            <input
              type="color"
              defaultValue={tier.color || '#9ca3af'}
              onBlur={(event) => { if (event.target.value !== tier.color) saveTier(tier, { color: event.target.value }) }}
              className="h-9 w-full cursor-pointer rounded-lg border border-[var(--app-hairline)] bg-white"
              aria-label={`${tier.name} 등급 색`}
            />
            <input
              defaultValue={tier.description || ''}
              maxLength={200}
              placeholder="등급 설명 (선택)"
              onBlur={(event) => { if (event.target.value !== (tier.description || '')) saveTier(tier, { description: event.target.value }) }}
              className={fieldClass}
              aria-label={`${tier.name} 등급 설명`}
            />
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} className="rounded-full border border-[var(--app-hairline)] bg-white p-1.5 disabled:opacity-40" aria-label={`${tier.name} 위로`}>
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={busy || index === tiers.length - 1} className="rounded-full border border-[var(--app-hairline)] bg-white p-1.5 disabled:opacity-40" aria-label={`${tier.name} 아래로`}>
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => removeTier(tier)} disabled={busy} className="rounded-full border border-[var(--app-hairline)] bg-white p-1.5 text-rose-600 disabled:opacity-40" aria-label={`${tier.name} 삭제`}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
        {tiers.length === 0 && (
          <li className="rounded-lg border border-dashed border-[var(--app-hairline)] px-3 py-6 text-center text-sm font-semibold text-[var(--theme-body-muted)]">
            아직 등급이 없습니다.
          </li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={40}
          placeholder="새 등급 이름"
          className="w-40 rounded-lg border border-[var(--app-hairline)] bg-white px-3 py-2 text-sm outline-none"
        />
        <input
          type="color"
          value={newColor}
          onChange={(event) => setNewColor(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--app-hairline)] bg-white"
          aria-label="새 등급 색"
        />
        <button type="button" onClick={addTier} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-[var(--app-accent)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          <Plus size={13} aria-hidden="true" />
          등급 추가
        </button>
      </div>
    </section>
  )
}
