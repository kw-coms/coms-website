import { useState } from 'react'
import { useAdminMembers } from './useAdminMembers'
import { showToast } from '../../components/common/Toast'
import { confirmDialog, promptDialog } from '../../components/common/ConfirmDialog'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import ErrorState from '../../components/common/ErrorState'
import { ASSIGNABLE_ROLES, ROLE_LABELS, displayStudentId } from '../../utils/roleAccess'
import RoleTag from '../../components/common/RoleTag'

const CREATE_MEMBER_ROLES = ['ASSOCIATE', 'USER', 'OFFICER', 'VICE_PRESIDENT']
const initialCreateForm = {
  studentId: '',
  name: '',
  email: '',
  password: '',
  generation: '',
  role: 'USER',
  department: '',
  phone: '',
}

function parseInterests(raw) {
  if (!raw) return []
  return raw.split(',').map((item) => {
    if (item.startsWith('기타:')) return `기타 (${item.slice(3)})`
    return item
  })
}



export default function AdminMembers({ currentUser }: { currentUser: { studentId?: string } }) {
  const { members, loading, error, refetch, addMember, updateRole, updateGeneration, removeMember, resetPassword } = useAdminMembers()
  const [expanded, setExpanded] = useState(null)
  const [createExpanded, setCreateExpanded] = useState(false)
  const [createForm, setCreateForm] = useState(initialCreateForm)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateChange = (event) => {
    const { name, value } = event.target
    setCreateForm((prev) => ({ ...prev, [name]: value }))
  }

  const validateCreateForm = () => {
    if (!/^\d{10}$/.test(createForm.studentId.trim())) return '학번은 숫자 10자리여야 합니다.'
    if (!createForm.name.trim()) return '이름을 입력해주세요.'
    if (!createForm.email.trim() || !createForm.email.includes('@')) return '올바른 이메일을 입력해주세요.'
    if (!createForm.password.trim()) return '임시 비밀번호를 입력해주세요.'
    if (!/^\d{1,3}$/.test(createForm.generation.trim())) return '기수는 숫자(1~3자리)로 입력해주세요.'
    if (!CREATE_MEMBER_ROLES.includes(createForm.role)) return '선택할 수 없는 역할입니다.'
    return ''
  }

  const handleCreateSubmit = async (event) => {
    event.preventDefault()
    setCreateError('')
    const validationMessage = validateCreateForm()
    if (validationMessage) {
      setCreateError(validationMessage)
      return
    }

    setCreating(true)
    try {
      await addMember({
        studentId: createForm.studentId.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        generation: createForm.generation.trim(),
        role: createForm.role,
        department: createForm.department.trim(),
        phone: createForm.phone.trim(),
      })
      await refetch()
      setCreateForm(initialCreateForm)
      setCreateExpanded(false)
      showToast({ message: '회원이 추가되었습니다.', tone: 'success' })
    } catch (err) {
      setCreateError(err.message || '회원 추가 중 오류가 발생했습니다.')
      showToast({ message: err.message || '회원 추가 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const handleRoleUpdate = async (member, newRole) => {
    if (!newRole || newRole === member.role) return
    try {
      await updateRole({ id: member.id, role: newRole })
    } catch (err) {
      showToast({ message: err.message || '역할 변경 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const handleGenerationEdit = async (member) => {
    const generation = await promptDialog({
      message: `${member.name} 회원의 기수를 입력하세요. (숫자만, 예: 60)`,
      defaultValue: member.generation || '',
    })
    if (generation === null) return
    if (!/^\d{1,3}$/.test(generation.trim())) {
      showToast({ message: '기수는 숫자(1~3자리)로 입력해주세요.', tone: 'error' })
      return
    }
    try {
      await updateGeneration({ id: member.id, generation: generation.trim() })
      showToast({ message: '기수가 변경되었습니다.' })
    } catch (err) {
      showToast({ message: err.message || '기수 변경 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const handleDelete = async (member) => {
    if (!(await confirmDialog({ message: `${member.name} 회원을 삭제하시겠습니까?`, tone: 'danger' }))) return
    try {
      await removeMember(member.id)
    } catch (err) {
      showToast({ message: err.message || '삭제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const handlePasswordReset = async (member) => {
    const newPassword = await promptDialog({ message: `${member.name} (${member.studentId}) 회원의 새 임시 비밀번호를 입력하세요.\n(관리자 초기화는 공백만 입력할 수 없습니다.)` })
    if (!newPassword) return
    try {
      await resetPassword({ id: member.id, password: newPassword })
      showToast({ message: '비밀번호가 초기화되었습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '비밀번호 초기화 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const createMemberPanel = (
    <section className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 p-4" aria-labelledby="add-member-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="add-member-heading" className="text-sm font-semibold text-[var(--theme-body-dark)]">회원 추가</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">
            이메일 인증 완료 상태로 생성됩니다. 임시 비밀번호는 최초 로그인 후 변경하도록 안내해주세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateExpanded((prev) => !prev)}
          aria-expanded={createExpanded}
          aria-controls="add-member-form"
          className="apple-action-secondary px-3 py-2 text-sm"
        >
          회원 추가
        </button>
      </div>

      {createExpanded && (
        <form id="add-member-form" onSubmit={handleCreateSubmit} className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="addMemberStudentId" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">학번</label>
              <input id="addMemberStudentId" name="studentId" value={createForm.studentId} onChange={handleCreateChange} inputMode="numeric" maxLength={10} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="addMemberName" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">이름</label>
              <input id="addMemberName" name="name" value={createForm.name} onChange={handleCreateChange} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="addMemberEmail" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">이메일</label>
              <input id="addMemberEmail" name="email" type="email" value={createForm.email} onChange={handleCreateChange} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label htmlFor="addMemberPassword" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">임시 비밀번호</label>
              <input id="addMemberPassword" name="password" type="password" value={createForm.password} onChange={handleCreateChange} autoComplete="new-password" className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="addMemberGeneration" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">기수</label>
              <input id="addMemberGeneration" name="generation" value={createForm.generation} onChange={handleCreateChange} inputMode="numeric" maxLength={3} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="addMemberRole" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">역할</label>
              <select id="addMemberRole" name="role" value={createForm.role} onChange={handleCreateChange} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm">
                {CREATE_MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={creating} className="apple-action-primary min-h-10 w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                {creating ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="addMemberDepartment" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">학과</label>
              <input id="addMemberDepartment" name="department" value={createForm.department} onChange={handleCreateChange} className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="addMemberPhone" className="mb-1 block text-xs font-semibold text-[var(--theme-body-dark)]">전화번호</label>
              <input id="addMemberPhone" name="phone" value={createForm.phone} onChange={handleCreateChange} inputMode="tel" className="w-full rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
            </div>
          </div>

          {createError && <p className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{createError}</p>}
        </form>
      )}
    </section>
  )

  if (loading) {
    return (
      <div className="space-y-3">
        {createMemberPanel}
        <SkeletonGroup label="회원 목록을 불러오는 중">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonGroup>
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={() => refetch()} />

  return (
    <div className="space-y-3">
      {createMemberPanel}
      {members.length === 0 && <p className="text-sm text-[var(--theme-body-muted)]">회원이 없습니다.</p>}
      {members.map((member) => {
        const isSelf = member.studentId === currentUser.studentId
        const isExpanded = expanded === member.id
        const interests = parseInterests(member.interests)
        const hasExtra = member.aspiration || interests.length > 0

        return (
          <div key={member.id} className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--theme-body-dark)]">{member.name}</span>
                  <span className="text-xs text-[var(--theme-body-muted)]">{displayStudentId(member.studentId)}</span>
                  {member.generation && <span className="text-xs font-semibold text-[var(--theme-body-muted)]">{member.generation}기</span>}
                  <RoleTag role={member.role} />
                </div>
                <p className="mt-0.5 text-xs text-[var(--theme-body-muted)]">
                  {member.email}
                  {member.emailVerified ? ' · 이메일 인증' : ' · 이메일 미인증'}
                  {member.phone && ` · ${member.phone}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {hasExtra && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : member.id)}
                    className="text-xs font-semibold text-blue-500 transition hover:underline"
                  >
                    {isExpanded ? '접기' : '상세'}
                  </button>
                )}
                {!isSelf && (
                  <>
                    <select
                      value={member.role || 'USER'}
                      onChange={(event) => handleRoleUpdate(member, event.target.value)}
                      aria-label={`${member.name} 역할 변경`}
                      className="rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-1.5 py-0.5 text-xs font-semibold text-[var(--app-text)]"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleGenerationEdit(member)}
                      className="text-xs font-semibold text-blue-500 transition hover:underline"
                    >
                      기수 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePasswordReset(member)}
                      className="text-xs font-semibold text-amber-600 transition hover:underline"
                    >
                      비번 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member)}
                      className="text-xs font-semibold text-red-500 transition hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && hasExtra && (
              <div className="space-y-2 border-t border-[var(--app-hairline)] bg-black/3 px-4 py-3">
                {interests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-body-muted)]">관심 분야</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {interests.map((item) => (
                        <span key={item} className="rounded bg-black/8 px-2 py-0.5 text-xs font-semibold text-[var(--theme-body-dark)]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {member.aspiration && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-body-muted)]">포부</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--theme-body-dark)]">{member.aspiration}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
