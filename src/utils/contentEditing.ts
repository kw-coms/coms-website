export function canEditArchive(user: { role?: string; studentId?: string } | null, file: { uploadedBy?: string }) {
  return !!user && (user.role === 'ADMIN' || (!!user.studentId && user.studentId === file.uploadedBy))
}

export function authorChangePayload(mode: string, name: string, studentId: string) {
  if (mode === 'member') {
    if (!studentId) throw new Error('회원을 선택해주세요.')
    return { studentId }
  }
  if (!name.trim()) throw new Error('이름을 입력해주세요.')
  return { name: name.trim() }
}
