type Viewer = { studentId?: string | number | null; id?: number | string | null } | null | undefined

export function workViewerKey(user: Viewer): string {
  if (!user) return 'guest'
  if (user.studentId != null && String(user.studentId).trim()) return `member:${user.studentId}`
  return `member-id:${user.id ?? 'unknown'}`
}
