import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import {
  createClubActivityCategory,
  deleteClubActivityCategory,
  updateClubActivityCategory,
} from '../../services/clubActivityApi'
import { CLUB_ACTIVITIES_QUERY_KEY, CLUB_ACTIVITY_CATEGORIES_QUERY_KEY } from '../../shared/homeUi'

function ActivityCategoryManager({ categories, activityFormCategory, onCategoryCreated, onCategoryFormReset, onClose }) {
  const queryClient = useQueryClient()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [categoryEditName, setCategoryEditName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [categoryNotice, setCategoryNotice] = useState('')

  const refreshActivityCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITY_CATEGORIES_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
  }

  const addActivityCategory = async (event) => {
    event.preventDefault()
    if (!newCategoryName.trim() || categoryBusy) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      const created = await createClubActivityCategory({ name: newCategoryName.trim() })
      setNewCategoryName('')
      onCategoryCreated(created?.key)
      await refreshActivityCategories()
      setCategoryNotice('분류를 추가했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 추가하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const startCategoryRename = (category) => {
    setEditingCategoryId(category.id)
    setCategoryEditName(category.name || '')
    setCategoryError('')
    setCategoryNotice('')
  }

  const saveActivityCategory = async (category) => {
    if (!categoryEditName.trim() || categoryBusy) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      await updateClubActivityCategory(category.id, { name: categoryEditName.trim() })
      setEditingCategoryId(null)
      setCategoryEditName('')
      await refreshActivityCategories()
      setCategoryNotice('분류 이름을 변경했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 수정하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const removeActivityCategory = async (category) => {
    if (categoryBusy) return
    if (!(await confirmDialog({ message: `'${category.name}' 분류를 삭제할까요?`, tone: 'danger' }))) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      await deleteClubActivityCategory(category.id)
      if (activityFormCategory === category.key) {
        onCategoryFormReset()
      }
      await refreshActivityCategories()
      setCategoryNotice('분류를 삭제했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 삭제하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  return (
    <div className="activity-category-manager mt-4" aria-label="활동 분류 관리">
      <div className="activity-category-manager-head">
        <div>
          <p className="activity-community-board-label">분류 설정</p>
          <h3>활동 분류 관리</h3>
        </div>
        <button type="button" onClick={onClose} className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-1 px-3 py-2 text-sm">
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <form onSubmit={addActivityCategory} className="activity-category-add-form">
        <label>
          <span>새 분류 이름</span>
          <input
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            maxLength={60}
            placeholder="예: 해커톤"
          />
        </label>
        <button type="submit" disabled={categoryBusy || !newCategoryName.trim()} className="apple-action-primary inline-flex min-h-11 items-center justify-center gap-1 px-4 py-2.5 text-sm">
          <Plus size={14} aria-hidden="true" />
          분류 추가
        </button>
      </form>

      <ul className="activity-category-list">
        {categories.map((category) => (
          <li key={category.key}>
            {editingCategoryId === category.id ? (
              <div className="activity-category-edit-row">
                <input
                  aria-label={`${category.name} 이름`}
                  value={categoryEditName}
                  onChange={(event) => setCategoryEditName(event.target.value)}
                  maxLength={60}
                />
                <button type="button" onClick={() => saveActivityCategory(category)} disabled={categoryBusy || !categoryEditName.trim()}>
                  저장
                </button>
                <button type="button" onClick={() => { setEditingCategoryId(null); setCategoryEditName('') }}>
                  취소
                </button>
              </div>
            ) : (
              <>
                <div className="activity-category-name">
                  <strong>{category.name}</strong>
                  <span>{category.key} · 사용 {category.activityCount ?? 0}건</span>
                </div>
                <div className="activity-category-actions">
                  <button type="button" onClick={() => startCategoryRename(category)} disabled={categoryBusy || !category.id}>
                    이름 변경
                  </button>
                  <button type="button" onClick={() => removeActivityCategory(category)} disabled={categoryBusy || !category.id}>
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {categoryNotice && <p className="activity-community-notice mt-3">{categoryNotice}</p>}
      {categoryError && <p className="community-compose-error mt-3 text-sm font-semibold text-red-500">{categoryError}</p>}
    </div>
  )
}

export default ActivityCategoryManager
