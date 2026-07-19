import { useState } from 'react'
import { useAdminMembers } from './useAdminMembers'
import { showToast } from '../../components/common/Toast'
import { confirmDialog, promptDialog } from '../../components/common/ConfirmDialog'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import ErrorState from '../../components/common/ErrorState'

function parseInterests(raw) {
  if (!raw) return []
  return raw.split(',').map((item) => {
    if (item.startsWith('기타:')) return `기타 (${item.slice(3)})`
    return item
  })
}

export default function AdminMembers({ currentUser }: { currentUser: { studentId?: string } }) {
  const { members, loading, error, refetch, updateRole, removeMember, resetPassword } = useAdminMembers()
  const [expanded, setExpanded] = useState(null)

  const handleRoleUpdate = async (member) => {
    const newRole = member.role === 'ADMIN' ? 'USER' : 'ADMIN'
    try {
      await updateRole({ id: member.id, role: newRole })
    } catch (err) {
      showToast({ message: err.message || '역할 변경 중 오류가 발생했습니다.', tone: 'error' })
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

  if (loading) {
    return (
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
    )
  }
  if (error) return <ErrorState message={error} onRetry={() => refetch()} />
  if (members.length === 0) return <p className="text-sm text-[var(--theme-body-muted)]">회원이 없습니다.</p>

  return (
    <div className="space-y-2">
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
                  <span className="text-xs text-[var(--theme-body-muted)]">{member.studentId}</span>
                  {member.role === 'ADMIN' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">관리자</span>
                  )}
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
                    <button
                      type="button"
                      onClick={() => handleRoleUpdate(member)}
                      className="text-xs font-semibold text-blue-500 transition hover:underline"
                    >
                      {member.role === 'ADMIN' ? '일반 회원으로' : '관리자 지정'}
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
