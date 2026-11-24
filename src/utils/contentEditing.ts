import { PERMISSIONS, type PermissionSet } from './roleAccess'

export function ownsArchive(user: { studentId?: string } | null, file: { uploadedBy?: string }) {
  return !!user?.studentId && user.studentId === file.uploadedBy
}

export function canEditArchive(user: { role?: string; studentId?: string } | null, file: { uploadedBy?: string }, permissions?: PermissionSet) {
  return !!user && (user.role === 'ADMIN' || ownsArchive(user, file) || !!permissions && [...permissions].includes(PERMISSIONS.archiveEditAny))
}

export function authorChangePayload(mode: string, name: string, studentId: string) {
  if (mode === 'member') {
    if (!studentId) throw new Error('회원을 선택해주세요.')
    return { studentId }
  }
  if (!name.trim()) throw new Error('이름을 입력해주세요.')
  return { name: name.trim() }
}
