type ThreadComment = { id: number; parentCommentId?: number | null }

export function orderWorkComments<T extends ThreadComment>(comments: T[]): { comment: T; depth: number }[] {
  const children = new Map<number | null, T[]>()
  for (const comment of comments) {
    const parent = comment.parentCommentId ?? null
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(comment)
  }
  const rows: { comment: T; depth: number }[] = []
  const seen = new Set<number>()
  const visit = (comment: T, depth: number) => {
    if (seen.has(comment.id)) return
    seen.add(comment.id)
    rows.push({ comment, depth })
    for (const reply of children.get(comment.id) ?? []) visit(reply, depth + 1)
  }
  for (const root of children.get(null) ?? []) visit(root, 0)
  // A deleted or stale parent must never hide a comment from its author.
  for (const comment of comments) if (!seen.has(comment.id)) visit(comment, 0)
  return rows
}

export function removeWorkCommentThread<T extends ThreadComment>(comments: T[], id: number): T[] {
  const removed = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const comment of comments) {
      if (comment.parentCommentId != null && removed.has(comment.parentCommentId) && !removed.has(comment.id)) {
        removed.add(comment.id)
        changed = true
      }
    }
  }
  return comments.filter((comment) => !removed.has(comment.id))
}
