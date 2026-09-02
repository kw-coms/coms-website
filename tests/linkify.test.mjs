import assert from 'node:assert/strict'

import { trimTrailingPunctuation } from '../src/utils/linkify.tsx'

const base = 'https://coms.kw.ac.kr/notice/12'

// Sentence punctuation is not part of the link.
for (const mark of ['.', ',', ';', ':', '!', '?', ')', ']', "'", '"']) {
  assert.equal(trimTrailingPunctuation(base + mark), base, `trailing ${mark} must be trimmed`)
}

// Several at once ("…확인하세요!!").
assert.equal(trimTrailingPunctuation(`${base}!!`), base)
assert.equal(trimTrailingPunctuation(`${base}?").`), base)

// A URL with no trailing punctuation is untouched, including its query/fragment.
assert.equal(trimTrailingPunctuation(base), base)
assert.equal(trimTrailingPunctuation(`${base}?tab=all#top`), `${base}?tab=all#top`)
assert.equal(trimTrailingPunctuation('https://coms.kw.ac.kr/a_b-c~d'), 'https://coms.kw.ac.kr/a_b-c~d')

// A closing bracket that pairs with one inside the URL belongs to the URL.
assert.equal(
  trimTrailingPunctuation('https://en.wikipedia.org/wiki/Kwangwoon_(university)'),
  'https://en.wikipedia.org/wiki/Kwangwoon_(university)',
)
assert.equal(trimTrailingPunctuation('https://example.com/a[1]'), 'https://example.com/a[1]')
// …but an unmatched one is sentence punctuation: "(자세히는 https://example.com/a)".
assert.equal(trimTrailingPunctuation('https://example.com/a)'), 'https://example.com/a')
// A paired bracket followed by a sentence period still loses only the period.
assert.equal(
  trimTrailingPunctuation('https://en.wikipedia.org/wiki/Kwangwoon_(university).'),
  'https://en.wikipedia.org/wiki/Kwangwoon_(university)',
)

// The scheme is never eaten, even by a degenerate input.
assert.equal(trimTrailingPunctuation('https://.'), 'https://')

// Empty / nullish input is tolerated (the caller feeds it regex matches).
assert.equal(trimTrailingPunctuation(''), '')
assert.equal(trimTrailingPunctuation(null), '')
assert.equal(trimTrailingPunctuation(undefined), '')
