import { useEffect, useState } from 'react'
import { listMembers } from '../../services/adminApi'
import { useModalFocus } from '../../hooks/useModalFocus'
import { authorChangePayload } from '../../utils/contentEditing'

/** Mounted only after an authorized user opens the author action. */
export default function AuthorChangeDialog({ name = '', allowMemberSelection, onSave, onClose }: {
  name?: string
  allowMemberSelection: boolean
  onSave: (payload: { name?: string; studentId?: string }) => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState('name')
  const [customName, setCustomName] = useState(name)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [members, setMembers] = useState<{ name: string; studentId: string }[]>([])
  const [loading, setLoading] = useState(allowMemberSelection)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useModalFocus(true, () => { if (!saving) onClose() })
  useEffect(() => {
    if (!allowMemberSelection) return
    let active = true
    listMembers().then(data => { if (active) setMembers(Array.isArray(data) ? data : []) })
      .catch(() => { if (active) setError('회원 목록을 불러오지 못했습니다. 닫았다가 다시 시도해주세요.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [allowMemberSelection])
  const filtered = members.filter(member => `${member.name} ${member.studentId}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <form ref={ref} role="dialog" aria-modal="true" aria-label="작성자 변경" className="apple-soft-panel max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-5" onSubmit={async event => {
      event.preventDefault()
      setError('')
      try {
        const payload = authorChangePayload(mode, customName, selected)
        setSaving(true)
        await onSave(payload)
        onClose()
      } catch (err) { setError(err.message || '작성자 변경에 실패했습니다.') }
      finally { setSaving(false) }
    }}>
      <h2 className="text-lg font-bold">작성자 변경</h2>
      <fieldset disabled={saving} className="space-y-3">
        <label className="mr-4"><input type="radio" name="author-mode" checked={mode === 'name'} onChange={() => setMode('name')} /> 이름 직접 입력</label>
        {allowMemberSelection && <label><input type="radio" name="author-mode" checked={mode === 'member'} onChange={() => setMode('member')} /> 회원 선택</label>}
        {mode === 'name' ? <>
          <p className="text-sm">표시 이름만 변경합니다. 실제 작성자와 소유권은 유지됩니다.</p>
          <input aria-label="표시 이름" className="min-h-11 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-[var(--app-text)]" value={customName} maxLength={60} onChange={event => setCustomName(event.target.value)} />
        </> : <>
          <p className="text-sm">선택한 회원으로 실제 작성자와 소유권을 변경합니다. 해당 회원에게 수정 권한이 넘어갑니다.</p>
          <input aria-label="회원 검색" placeholder="이름 또는 학번 검색" className="min-h-11 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-[var(--app-text)]" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="회원 선택" className="min-h-11 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-[var(--app-text)]" value={selected} disabled={loading} onChange={event => setSelected(event.target.value)}>
            <option value="">{loading ? '회원 목록 불러오는 중…' : '회원을 선택하세요'}</option>
            {filtered.map(member => <option key={member.studentId} value={member.studentId}>{member.name} ({member.studentId})</option>)}
          </select>
        </>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="apple-action-secondary px-4 py-2" disabled={saving} onClick={onClose}>취소</button>
        <button type="submit" className="apple-action-primary px-4 py-2" disabled={saving || (mode === 'member' && !selected)}>{saving ? '변경 중…' : mode === 'member' ? '소유권 변경 확인' : '표시 이름 변경'}</button>
      </div>
    </form>
  </div>
}
