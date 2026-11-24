import assert from 'node:assert/strict'
import { askFaqs } from '../src/data/askFaq.ts'
import { recruitFactRows, recruitSummary } from '../src/data/recruitFacts.ts'
import { defaultSiteSettings } from '../src/services/siteSettingsApi.ts'

const faqs = askFaqs()

assert.deepEqual(faqs.map((faq) => faq.question), [
  '어떻게 가입하나요?',
  '코딩을 처음 해도 괜찮나요?',
  '회비와 동아리방이 궁금해요',
])
assert.ok(faqs.every((faq) => faq.href === '/recruit' && faq.answer.length > 20))
assert.match(faqs[0].answer, /로그인 없이/)
assert.match(faqs[1].answer, /코딩이 처음이어도 괜찮/)
assert.doesNotMatch(faqs[1].answer, /합격|선발 확정|무조건 가입|모집|마감/)
assert.ok(faqs[2].answer.includes(defaultSiteSettings.recruitFee))
assert.ok(faqs[2].answer.includes(defaultSiteSettings.recruitRoom))
assert.doesNotMatch(JSON.stringify(faqs), /출입.?코드|도어락|비밀번호/)

const updated = { ...defaultSiteSettings, recruitCohort: '61기', recruitFee: '3만원', recruitRoom: '복지관 405호', recruitHeadline: '61기 모집 안내' }
assert.equal(recruitFactRows(updated)[0].value, '61기 상시 모집, 마감 없음')
assert.match(recruitSummary(updated), /회비는 3만원, 동아리방은 복지관 405호/)
assert.match(askFaqs(updated)[2].answer, /3만원, 동아리방은 복지관 405호/)

console.log('ask FAQ data contract passed')
