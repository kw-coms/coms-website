# Member Experience Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the COMS community easier for members to search, sort, and audit after a deletion.

**Architecture:** Keep backend contracts unchanged and move member-facing list logic into a small pure utility. The Community page consumes the utility for body-aware search, deterministic sorting, and deleted-post timelines.

**Tech Stack:** React, Vite, Node contract tests, Playwright smoke tests.

---

### Task 1: Community List Search And Sorting

**Files:**
- Create: `src/utils/communityExperience.js`
- Create: `tests/communityExperience.test.mjs`
- Modify: `src/pages/Community.jsx`
- Modify: `package.json`

- [x] **Step 1: Write the failing test**

```js
assert.deepEqual(
  filterAndSortCommunityPosts(posts, {
    category: 'ALL',
    query: '투표 개선',
    sort: 'comments',
    canSeeAnonymous: true,
  }).map((post) => post.id),
  [2],
)
```

- [x] **Step 2: Run test to verify it fails**

Run: `node tests/communityExperience.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/communityExperience.js`.

- [x] **Step 3: Write minimal implementation**

Implement `filterAndSortCommunityPosts()` with anonymous filtering, category filtering, multi-term body-aware search, and `latest/comments/score/views` sorting.

- [x] **Step 4: Wire UI**

Add sort chips to `src/pages/Community.jsx` and route existing pagination through the utility.

- [x] **Step 5: Verify**

Run: `npm test`, `npm run lint`, `npm run build`, targeted Playwright smoke.

### Task 2: Deleted Post Timeline

**Files:**
- Modify: `src/utils/communityExperience.js`
- Modify: `src/pages/Community.jsx`
- Modify: `tests/communityExperience.test.mjs`

- [x] **Step 1: Write the failing test**

```js
const timeline = buildDeletedPostTimeline(record)
assert.deepEqual(timeline.map((item) => item.label), ['작성됨', '삭제됨', '복원 요청', '검토 완료', '복원됨'])
```

- [x] **Step 2: Run test to verify it fails**

Run: `node tests/communityExperience.test.mjs`
Expected: FAIL before utility implementation.

- [x] **Step 3: Implement timeline builder**

Build timeline rows from `createdAt`, `deletedAt`, appeal fields, resolution fields, and `restoredAt`.

- [x] **Step 4: Render timeline**

Render a compact timeline in the member deleted-post card.

- [x] **Step 5: Verify**

Run: `npm test`.
