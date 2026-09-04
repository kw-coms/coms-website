import assert from 'node:assert/strict'

import { recruitDecisionLabel, recruitDecisionChipVariant } from '../src/pages/admin/recruitStatus.ts'

// 불합격 처리 시 지원서 행 삭제 + 처리 이력 보존 기능의 칩 매핑을 검증한다.
// 합격은 기존 accent 톤(category), 불합격은 rose 톤(admin)이어야 한다.
assert.equal(recruitDecisionLabel('ACCEPTED'), '합격')
assert.equal(recruitDecisionLabel('REJECTED'), '불합격')
assert.equal(recruitDecisionLabel(undefined), '합격')

assert.equal(recruitDecisionChipVariant('ACCEPTED'), 'category')
assert.equal(recruitDecisionChipVariant('REJECTED'), 'admin')
assert.equal(recruitDecisionChipVariant(undefined), 'category')

console.log('recruit decision chip mapping passed')
