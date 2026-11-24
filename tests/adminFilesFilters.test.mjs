import assert from 'node:assert/strict'
import { archiveFileType, filterSortArchiveFiles } from '../src/pages/admin/archiveFileFilters.ts'

const rows = [
  { id: 1, title: '논문 자료', originalName: 'paper.pdf', uploaderName: '김하늘', category: 'ACADEMIC_JOURNAL', visibility: 'MEMBERS', uploadedAt: '2026-11-20', viewCount: 2, attachments: [{ originalName: 'paper.pdf', mimeType: 'application/pdf', fileSize: 100 }, { originalName: 'appendix.zip', mimeType: 'application/zip', fileSize: 20 }] },
  { id: 2, title: '사진', originalName: 'club.png', uploaderName: '이바다', category: 'GENERAL', visibility: 'PUBLIC', uploadedAt: '2026-11-22', viewCount: 9, mimeType: 'image/png', fileSize: 30 },
  { id: 3, title: '소스', originalName: 'src.zip', uploaderName: '박산', category: 'GENERAL', visibility: 'SELECTED', uploadedAt: '2026-11-21', viewCount: 4, mimeType: 'application/zip', fileSize: 400 },
]
const defaults = { query: '', category: 'ALL', visibility: 'ALL', fileType: 'ALL', sort: 'newest' }
const run = (patch) => filterSortArchiveFiles(rows, { ...defaults, ...patch }).map((row) => row.id)

assert.deepEqual(run({}), [2, 3, 1])
assert.deepEqual(run({ query: 'APPENDIX' }), [1], 'searches every attachment filename')
assert.deepEqual(run({ query: '김하늘' }), [1], 'searches uploader')
assert.deepEqual(run({ category: 'GENERAL', visibility: 'SELECTED', fileType: 'archive' }), [3])
assert.deepEqual(run({ fileType: 'document' }), [1])
assert.deepEqual(run({ fileType: 'archive' }), [3, 1], 'matches a secondary attachment type')
assert.deepEqual(run({ sort: 'size' }), [3, 1, 2], 'sums all attachments')
assert.deepEqual(run({ sort: 'views' }), [2, 3, 1])
assert.deepEqual(run({ sort: 'name' }), [...rows].sort((a, b) => a.title.localeCompare(b.title, 'ko')).map((row) => row.id))
assert.equal(archiveFileType(rows[1]), 'image')
assert.deepEqual(rows.map((row) => row.id), [1, 2, 3], 'does not mutate the caller array')
console.log('admin archive filters passed')
