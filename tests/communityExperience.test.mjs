import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

assert.match(
  postBlocksSource,
  /<img\s+src=\{src\}\s+alt=\{block\.name \|\| '이미지'\}[\s\S]*?className="community-inline-media-image"[\s\S]*?loading="lazy"[\s\S]*?decoding="async"/,
)

assert.match(
  postBlocksSource,
  /<img\s+src=\{src\}\s+alt=\{block\.title \|\| '외부 이미지'\}[\s\S]*?className="community-inline-media-image block"[\s\S]*?loading="lazy"[\s\S]*?decoding="async"/,
)

console.log('community experience contract passed')
