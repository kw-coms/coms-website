import assert from 'node:assert/strict'
import { projectAddressLabel, projectFileHref, projectImageHref, safeProjectLinkUrl } from '../src/utils/appProjectUrls.ts'

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

assert.equal(projectAddressLabel('https://coms.kw.ac.kr/gameclub/', 'coms.kw.ac.kr'), 'coms.kw.ac.kr/gameclub')
assert.equal(projectAddressLabel('https://coms.kw.ac.kr/gameclub/?ref=preview'), 'coms.kw.ac.kr/gameclub')
assert.equal(projectAddressLabel('https://www.example.com/'), 'example.com')
assert.equal(projectAddressLabel('https://example.com/app', 'example.com/landing'), 'example.com/landing')
assert.equal(projectAddressLabel('javascript:alert(1)', 'coms.kw.ac.kr'), '')
assert.equal(projectImageHref('/api/club-projects/21/images/22'), '/api/club-projects/21/images/22')
assert.equal(projectImageHref('https://example.com/image.svg'), null)

console.log('app project URL tests passed')
