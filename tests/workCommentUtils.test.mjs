import assert from 'node:assert/strict'
import { orderWorkComments, removeWorkCommentThread } from '../src/components/apps/workCommentUtils.ts'

const comments = [
  { id: 1, parentCommentId: null, content: '첫 댓글' },
  { id: 2, parentCommentId: null, content: '둘째 댓글' },
  { id: 3, parentCommentId: 1, content: '첫 답글' },
  { id: 4, parentCommentId: 3, content: '답글의 답글' },
  { id: 5, parentCommentId: 999, content: '부모가 없는 댓글' },
]

assert.deepEqual(orderWorkComments(comments).map(({ comment, depth }) => [comment.id, depth]), [
  [1, 0], [3, 1], [4, 2], [2, 0], [5, 0],
], 'replies follow their parent, orphaned comments remain visible')
assert.deepEqual(removeWorkCommentThread(comments, 3).map((comment) => comment.id), [1, 2, 5], 'deleting a reply removes its descendants')
assert.deepEqual(removeWorkCommentThread(comments, 1).map((comment) => comment.id), [2, 5], 'deleting a root removes all replies')
assert.deepEqual(removeWorkCommentThread(comments, 42), comments, 'unknown deletion is a no-op')

console.log('work comment tree tests passed')
