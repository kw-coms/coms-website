import assert from 'node:assert/strict'
import { canEditArchive, authorChangePayload } from '../src/utils/contentEditing.ts'

assert.equal(canEditArchive({ role: 'ADMIN', studentId: 'boss' }, { uploadedBy: 'other' }), true)
assert.equal(canEditArchive({ role: 'VICE_PRESIDENT', studentId: 'vp' }, { uploadedBy: 'other' }), false)
assert.equal(canEditArchive({ role: 'USER', studentId: 'owner' }, { uploadedBy: 'owner' }), true)
assert.equal(canEditArchive(null, { uploadedBy: null }), false)
assert.deepEqual(authorChangePayload('name', ' 박채현 ', 'ignored'), { name: '박채현' })
assert.deepEqual(authorChangePayload('member', 'ignored', '2026123456'), { studentId: '2026123456' })
assert.throws(() => authorChangePayload('member', 'ignored', ''), /회원/)
assert.throws(() => authorChangePayload('name', '  ', ''), /이름/)
console.log('content editing tests passed')
