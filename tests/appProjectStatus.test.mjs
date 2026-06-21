import assert from 'node:assert/strict'
import { buildProjectStatusBadges } from '../src/utils/appProjectStatus.js'

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: 'https://coms.kw.ac.kr/worldcup/',
  files: [],
}).map((badge) => badge.label), ['열기 가능', 'COMS 호스팅'])

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: 'https://example.com/app',
  files: [{ id: 1 }],
}).map((badge) => badge.label), ['열기 가능', '외부 링크', '다운로드'])

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: '',
  files: [],
}).map((badge) => badge.label), ['준비 중'])

console.log('app project status contract passed')
