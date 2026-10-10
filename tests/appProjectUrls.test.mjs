import assert from 'node:assert/strict'
import { projectFileHref, safeProjectLinkUrl } from '../src/utils/appProjectUrls.ts'

assert.equal(safeProjectLinkUrl('https://example.com/app'), 'https://example.com/app')
assert.equal(safeProjectLinkUrl('http://kwmate.com/'), 'http://kwmate.com/')
for (const value of [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  '//example.com/app',
  'https://user:pass@example.com/',
  'https://example.com/\njavascript:alert(1)',
  'not a URL',
]) {
  assert.equal(safeProjectLinkUrl(value), null, `unsafe project link must be rejected: ${value}`)
}

assert.equal(projectFileHref('/api/club-projects/21/files/203/download'), '/api/club-projects/21/files/203/download')
for (const value of [
  '//evil.example/download',
  'javascript:alert(1)',
  '/api/club-projects/21/files/203/download?redirect=https://evil.example',
  '/api/club-projects/../../admin',
]) {
  assert.equal(projectFileHref(value), '#', `untrusted file route must be rejected: ${value}`)
}

console.log('app project URL tests passed')
