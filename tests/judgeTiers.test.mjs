import assert from 'node:assert/strict'
import test from 'node:test'
import { judgeTier, JUDGE_TIER_FAMILIES } from '../src/pages/study/exercises/judgeTiers.ts'

test('COMS tiers cover every Bronze V through Ruby I division with stable boundaries', () => {
  assert.deepEqual(JUDGE_TIER_FAMILIES.map(({ label }) => label), [
    '미평가', '브론즈', '실버', '골드', '플래티넘', '다이아몬드', '루비', '마스터',
  ])
  for (const [value, label] of [[1, '브론즈 V'], [5, '브론즈 I'], [6, '실버 V'], [10, '실버 I'],
    [11, '골드 V'], [15, '골드 I'], [16, '플래티넘 V'], [20, '플래티넘 I'],
    [21, '다이아몬드 V'], [25, '다이아몬드 I'], [26, '루비 V'], [30, '루비 I']]) {
    assert.equal(judgeTier({ level: 1, difficultyTier: value }).label, label)
  }
  assert.equal(judgeTier({ level: 1, difficultyTier: 0 }).label, '미평가')
  assert.equal(judgeTier({ level: 1, difficultyTier: 31 }).label, '마스터')
  assert.equal(judgeTier({ level: 1, difficultyTier: 12 }).value, 12)
  assert.equal(judgeTier({ level: 5 }).estimated, true)
})
