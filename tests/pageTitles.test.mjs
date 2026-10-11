import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { SITE_TITLE, documentTitleFor, routeLabel } from '../src/routes/pageTitles.ts'

// The home page keeps the full site title that index.html ships with.
assert.equal(documentTitleFor('/'), SITE_TITLE)
assert.equal(routeLabel('/'), '')

// Every other route gets its own label so tabs and history entries are distinguishable.
assert.equal(documentTitleFor('/notices'), "공지사항 | KW COM's")
assert.equal(documentTitleFor('/notices/'), "공지사항 | KW COM's", 'a trailing slash resolves to the same route')
assert.equal(documentTitleFor('/community'), "커뮤니티 | KW COM's")
assert.equal(documentTitleFor('/community/bookmarks'), "내 스크랩 | KW COM's", 'specific community routes win over the :id pattern')
assert.equal(documentTitleFor('/community/members/2026123456'), "회원 프로필 | KW COM's")
assert.equal(documentTitleFor('/resources/12'), "자료실 | KW COM's")
assert.equal(documentTitleFor('/login'), "로그인 | KW COM's")

// An opened item's own title leads, so the tab says what is being read.
assert.equal(documentTitleFor('/notices/3', '  정기 총회   안내 '), "정기 총회 안내 | 공지사항 | KW COM's")
assert.equal(documentTitleFor('/community/9', ''), "커뮤니티 | KW COM's", 'a blank detail falls back to the section title')
const long = documentTitleFor('/community/9', '가'.repeat(200))
assert.ok(long.length < 90, 'very long item titles are clamped')
assert.ok(long.startsWith('가'.repeat(59) + '…'))

// Unknown paths render the 404 page; the title must say so and ignore any stale detail.
assert.equal(routeLabel('/nope'), null)
assert.equal(documentTitleFor('/nope', '남은 제목'), "페이지를 찾을 수 없음 | KW COM's")
assert.equal(routeLabel('/community/1/extra'), null, 'deeper paths than the router matches are not labelled')

// Drift guard: every concrete route declared in App.tsx must have a label.
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const paths = [...app.matchAll(/<Route path="([^"*]+)"/g)].map((match) => match[1])
assert.ok(paths.length >= 20, 'expected to read the route table from App.tsx')
for (const path of paths) {
  const sample = path.replace(/:[A-Za-z]+/g, '1')
  assert.notEqual(routeLabel(sample), null, `route ${path} needs a document title in src/routes/pageTitles.ts`)
}

console.log('page titles contract passed')
