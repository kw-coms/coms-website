import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  buildDeletedPostTimeline,
  filterAndSortCommunityPosts,
} from '../src/utils/communityExperience.ts'

const posts = [
  {
    id: 1,
    title: '정기 회의 안내',
    content: '이번 주 회의실은 참빛관입니다.',
    category: 'GENERAL',
    authorDisplayName: '김회의',
    createdAt: '2026-06-18T08:00:00',
    commentCount: 1,
    upvotes: 2,
    downvotes: 0,
    viewCount: 10,
  },
  {
    id: 2,
    title: '투표 결과 공유',
    content: JSON.stringify([{ type: 'text', content: '모바일 투표 카드 개선 의견' }]),
    category: 'QUESTION',
    authorName: '박투표',
    createdAt: '2026-06-18T09:00:00',
    commentCount: 8,
    upvotes: 5,
    downvotes: 1,
    viewCount: 30,
  },
  {
    id: 3,
    title: '익명 게시글',
    content: '졸업생에게는 보이면 안 됩니다.',
    category: 'ANONYMOUS',
    authorDisplayName: '익명',
    createdAt: '2026-06-18T10:00:00',
    commentCount: 0,
    upvotes: 10,
    downvotes: 0,
    viewCount: 90,
  },
]

assert.deepEqual(
  filterAndSortCommunityPosts(posts, {
    category: 'ALL',
    query: '투표 개선',
    sort: 'comments',
    canSeeAnonymous: true,
  }).map((post) => post.id),
  [2],
)

assert.deepEqual(
  filterAndSortCommunityPosts(posts, {
    category: 'ALL',
    query: '',
    sort: 'score',
    canSeeAnonymous: false,
  }).map((post) => post.id),
  [2, 1],
)

// Pinned posts surface first regardless of sort mode, then the chosen sort
// applies among the remaining (and among multiple pinned) posts.
const pinnedPosts = [
  { id: 10, title: 'A', category: 'GENERAL', createdAt: '2026-06-18T08:00:00', commentCount: 0, upvotes: 0, downvotes: 0, viewCount: 5 },
  { id: 11, title: 'B', category: 'GENERAL', createdAt: '2026-06-18T09:00:00', commentCount: 100, upvotes: 0, downvotes: 0, viewCount: 5, pinned: false },
  { id: 12, title: 'C 공지', category: 'GENERAL', createdAt: '2026-06-18T07:00:00', commentCount: 1, upvotes: 0, downvotes: 0, viewCount: 5, pinned: true },
]

// Sorting by comments would put id 11 first, but the pinned id 12 wins.
assert.deepEqual(
  filterAndSortCommunityPosts(pinnedPosts, { category: 'ALL', query: '', sort: 'comments', canSeeAnonymous: true }).map((p) => p.id),
  [12, 11, 10],
)

// Latest sort: pinned still leads even though it is the oldest post.
assert.deepEqual(
  filterAndSortCommunityPosts(pinnedPosts, { category: 'ALL', query: '', sort: 'latest', canSeeAnonymous: true }).map((p) => p.id),
  [12, 11, 10],
)

// Two pinned posts keep the active sort order among themselves.
const twoPinned = [
  { id: 20, title: 'P1', category: 'GENERAL', createdAt: '2026-06-18T08:00:00', commentCount: 2, pinned: true },
  { id: 21, title: 'P2', category: 'GENERAL', createdAt: '2026-06-18T08:00:00', commentCount: 9, pinned: true },
  { id: 22, title: 'N', category: 'GENERAL', createdAt: '2026-06-18T08:00:00', commentCount: 50 },
]
assert.deepEqual(
  filterAndSortCommunityPosts(twoPinned, { category: 'ALL', query: '', sort: 'comments', canSeeAnonymous: true }).map((p) => p.id),
  [21, 20, 22],
)

const timeline = buildDeletedPostTimeline({
  createdAt: '2026-06-18T08:00:00',
  deletedAt: '2026-06-18T09:00:00',
  deletedByName: '관리자',
  deletedByStudentId: '2020123456',
  latestAppealStatus: 'APPROVED',
  latestAppealCreatedAt: '2026-06-18T09:10:00',
  latestAppealResolvedAt: '2026-06-18T09:40:00',
  latestAppealResolutionNote: '복원 처리 완료',
  restoredAt: '2026-06-18T09:45:00',
})

assert.deepEqual(timeline.map((item) => item.label), ['작성됨', '삭제됨', '복원 요청', '검토 완료', '복원됨'])
assert.equal(timeline[1].detail, '관리자(2020123456)')
assert.equal(timeline[3].detail, '복원 처리 완료')

const postBlocksSource = readFileSync('src/pages/community/PostBlocks.tsx', 'utf8')
const richEditorSource = readFileSync('src/pages/community/RichEditor.tsx', 'utf8')
const postEditorUtilsSource = readFileSync('src/pages/community/postEditorUtils.ts', 'utf8')
const tiptapTextEditorSource = readFileSync('src/pages/community/TiptapTextEditor.tsx', 'utf8')
const communityListSource = readFileSync('src/pages/community/CommunityListView.tsx', 'utf8')
const communityDetailSource = readFileSync('src/pages/community/CommunityDetailView.tsx', 'utf8')
const commentThreadSource = readFileSync('src/pages/community/CommentThread.tsx', 'utf8')

assert.match(
  postBlocksSource,
  /<img\s+src=\{src\}\s+alt=\{block\.name \|\| '이미지'\}[\s\S]*?className="community-inline-media-image"[\s\S]*?loading="lazy"[\s\S]*?decoding="async"/,
)

assert.match(
  postBlocksSource,
  /<img\s+src=\{src\}\s+alt=\{block\.title \|\| '외부 이미지'\}[\s\S]*?className="community-inline-media-image block"[\s\S]*?loading="lazy"[\s\S]*?decoding="async"/,
)

assert.match(tiptapTextEditorSource, /import FigureToolbar from '\.\/FigureToolbar'/)
assert.match(tiptapTextEditorSource, /if \(this\.editor\.isActive\('codeBlock'\)\) return false/)
assert.match(tiptapTextEditorSource, /savedSelectionRef = useRef<\{ from: number; to: number \} \| null>\(null\)/)
assert.match(tiptapTextEditorSource, /savedSelectionRef\.current = \{ from: editor\.state\.selection\.from, to: editor\.state\.selection\.to \}/)
assert.match(tiptapTextEditorSource, /setTextSelection\(savedSelectionRef\.current\)/)
assert.match(tiptapTextEditorSource, /tr\.setNodeMarkup\(selection\.from, undefined, \{ \.\.\.node\.attrs, \.\.\.changes \}\)/)
assert.match(tiptapTextEditorSource, /updateFigureMeta: \(id: string, changes: Record<string, unknown>\) => updateFigureNodeAttrs\(id, changes\)/)
assert.match(tiptapTextEditorSource, /tr\.setNodeMarkup\(pos, undefined, \{ \.\.\.node\.attrs, \.\.\.changes \}\)/)
assert.match(tiptapTextEditorSource, /deleteSelection\(\)\.run\(\)/)
assert.doesNotMatch(richEditorSource, /document\.execCommand|VITE_COMMUNITY_TIPTAP_P0|LegacyRichEditor|RichEditorSurface|domToBlocks/)
assert.doesNotMatch(postEditorUtilsSource, /export function domToBlocks/)
assert.equal(existsSync('src/pages/community/RichEditorSurface.tsx'), false)

for (const [name, source] of [
  ['list', communityListSource],
  ['detail', communityDetailSource],
  ['comments', commentThreadSource],
]) {
  assert.doesNotMatch(
    source,
    /ReputationBadge|authorTierLabel/,
    `community ${name} should not render reputation/activity tier badges`,
  )
}

console.log('community experience contract passed')
