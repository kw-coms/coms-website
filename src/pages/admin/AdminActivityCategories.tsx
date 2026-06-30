import { useState } from 'react'
import {
  createClubActivityCategory,
  deleteClubActivityCategory,
  updateClubActivityCategory,
} from '../../services/clubActivityApi'
import { confirmDialog } from '../../components/common/ConfirmDialog'

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

export default function AdminActivityCategories({ categories, onChanged }: {
  categories: { id: string | number; name: string; key?: string; activityCount?: number }[]
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const addCategory = async (event) => {
    event.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError('')
    try {
      await createClubActivityCategory({ name: newName.trim() })
      setNewName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const saveRename = async (category) => {
    if (!editName.trim()) return
    setBusy(true)
    setError('')
    try {
      await updateClubActivityCategory(category.id, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeCategory = async (category) => {
    if (!(await confirmDialog({ message: `'${category.name}' 분류를 삭제하시겠습니까?`, tone: 'danger' }))) return
    setBusy(true)
    setError('')
    try {
      await deleteClubActivityCategory(category.id)
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
      <p className="text-sm font-semibold text-[var(--theme-body-dark)]">활동 분류 관리</p>
      <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">활동 분류를 추가, 이름 변경, 삭제할 수 있습니다. 사용 중인 분류는 삭제할 수 없습니다.</p>

      <form onSubmit={addCategory} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          placeholder="새 분류 이름"
          className={ADMIN_INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
        >
          분류 추가
        </button>
      </form>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--app-hairline)] bg-white/60 px-3 py-2">
            {editingId === category.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={60}
                  className={ADMIN_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => saveRename(category)}
                  disabled={busy || !editName.trim()}
                  className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditName('') }}
                  className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline"
                >
                  취소
                </button>
              </div>
            ) : (
              <>
                <div className="text-sm text-[var(--theme-body-dark)]">
                  <span className="font-semibold">{category.name}</span>
                  <span className="ml-2 text-xs text-[var(--theme-body-muted)]">{category.key} · 사용 {category.activityCount ?? 0}건</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingId(category.id); setEditName(category.name) }}
                    className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline"
                  >
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(category)}
                    disabled={busy}
                    className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
