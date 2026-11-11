import assert from 'node:assert/strict'
import { ASK_FAQS } from '../src/data/askFaq.ts'
import { RECRUIT_FACTS } from '../src/data/recruitFacts.ts'

assert.deepEqual(ASK_FAQS.map((faq) => faq.question), [
  '어떻게 가입하나요?',
  '코딩을 처음 해도 괜찮나요?',
  '회비와 동아리방이 궁금해요',
])
assert.ok(ASK_FAQS.every((faq) => faq.href === '/recruit' && faq.answer.length > 20))
assert.match(ASK_FAQS[0].answer, /로그인 없이/)
assert.match(ASK_FAQS[1].answer, /코딩이 처음이어도 괜찮/)
assert.doesNotMatch(ASK_FAQS[1].answer, /합격|선발 확정|무조건 가입|모집|마감/)
assert.ok(ASK_FAQS[2].answer.includes(RECRUIT_FACTS.fee))
assert.ok(ASK_FAQS[2].answer.includes(RECRUIT_FACTS.room))
assert.doesNotMatch(JSON.stringify(ASK_FAQS), /출입.?코드|도어락|비밀번호/)

console.log('ask FAQ data contract passed')
