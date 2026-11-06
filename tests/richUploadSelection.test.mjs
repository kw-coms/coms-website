import assert from 'node:assert/strict'
import { validateUploadBlock } from '../src/pages/community/validateUploadBlock.ts'

const allowArchive = () => true
const mb = 1024 * 1024
const video = { name: 'clip.mp4', type: 'video/mp4', size: 60 * mb }
const image = { name: 'picture.png', type: 'image/png', size: 2 * mb }
const fiveFiles = Array.from({ length: 5 }, () => ({ type: 'file' }))
assert.deepEqual(validateUploadBlock(video, [], allowArchive), { type: 'video' })
assert.deepEqual(validateUploadBlock(image, fiveFiles, allowArchive), { type: 'image' })
assert.deepEqual(validateUploadBlock({ ...video, size: 101 * mb }, [], allowArchive), { error: '영상은 100MB 이하만 업로드할 수 있습니다.' })
assert.deepEqual(validateUploadBlock({ name: 'doc.pdf', type: 'application/pdf', size: 51 * mb }, [], allowArchive), { error: '첨부파일은 50MB 이하만 업로드할 수 있습니다.' })
console.log('rich upload selection contract passed')
