import assert from 'node:assert/strict'
import { archiveAttachments, archiveFileSize } from '../src/components/archive/archiveUtils.ts'
import { attachmentDownloadUrl } from '../src/services/archiveApi.ts'

const legacy = { id: 9, originalName: 'original.pdf', mimeType: 'application/pdf', fileSize: 10, contentVersion: 'old-version' }
assert.equal(archiveAttachments(legacy).length, 1)
assert.equal(archiveAttachments(legacy)[0].originalName, 'original.pdf')
assert.equal(archiveFileSize(legacy), 10)
assert.equal(attachmentDownloadUrl(legacy.id, null, legacy.contentVersion), '/api/files/9/download?v=old-version')

const grouped = { ...legacy, attachments: [
  { id: 31, originalName: 'first.pdf', fileSize: 10, contentVersion: 'first-version' },
  { id: 32, originalName: 'second.pdf', fileSize: 20, contentVersion: 'second version' },
] }
assert.deepEqual(archiveAttachments(grouped).map(file => file.originalName), ['first.pdf', 'second.pdf'])
assert.equal(archiveFileSize(grouped), 30, 'list size is the whole attachment set, not just the primary file')
assert.equal(attachmentDownloadUrl(grouped.id, 32, 'second version'), '/api/files/9/attachments/32/download?v=second%20version')
assert.equal(attachmentDownloadUrl(grouped.id, 31), '/api/files/9/attachments/31/download')
assert.equal(archiveFileSize({ ...legacy, attachments: [] }), 10, 'empty legacy attachment arrays use the original file')
assert.ok(Number.isNaN(archiveFileSize({ originalName: 'unknown.pdf' })), 'missing legacy sizes remain unknown')

console.log('archive attachment compatibility passed')
