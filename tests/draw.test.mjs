import assert from 'node:assert/strict'
import {
  MAX_DRAW_NAMES,
  clampTeamCount,
  cryptoRandom,
  orderToText,
  parseNames,
  pickSome,
  shuffled,
  splitIntoTeams,
  teamsToText,
} from '../src/utils/draw.ts'

// The names in a block of text. The people are made up.
assert.deepEqual(parseNames('홍길동\n김철수, 이영희;박민수\t최가람\r\n\n   정   하늘  ,,').names, ['홍길동', '김철수', '이영희', '박민수', '최가람', '정 하늘'])
assert.deepEqual(parseNames('').names, [])
assert.deepEqual(parseNames(null).names, [])
// A name written twice stays twice, and is pointed out once.
const twice = parseNames('김민수\n이영희\n김민수\n김민수\n이영희')
assert.deepEqual(twice.names, ['김민수', '이영희', '김민수', '김민수', '이영희'])
assert.deepEqual(twice.duplicates, ['김민수', '이영희'])
assert.equal(twice.dropped, 0)
// No more than the limit is kept.
const crowd = parseNames(Array.from({ length: MAX_DRAW_NAMES + 7 }, (_, index) => `회원${index}`).join('\n'))
assert.equal(crowd.names.length, MAX_DRAW_NAMES)
assert.equal(crowd.dropped, 7)

// Fisher-Yates with a fixed "random": the result is exactly what the algorithm says.
const letters = ['a', 'b', 'c', 'd']
assert.deepEqual(shuffled(letters, () => 0.999), ['a', 'b', 'c', 'd'], 'always the last place: nothing moves')
assert.deepEqual(shuffled(letters, () => 0), ['b', 'c', 'd', 'a'], 'always the first place')
assert.deepEqual(letters, ['a', 'b', 'c', 'd'], 'the list given is not changed')
assert.deepEqual(shuffled([], () => 0), [])

// Every order is about equally likely. A small seeded generator keeps the test the same on every run.
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = seeded(20261012)
const counts = new Map()
for (let run = 0; run < 6000; run += 1) {
  const key = shuffled([0, 1, 2], random).join('')
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
assert.equal(counts.size, 6, 'all six orders of three items turn up')
for (const [order, count] of counts) assert.ok(count > 850 && count < 1150, `order ${order} came up ${count} times of 6000`)

// Teams: sizes differ by one at most, everyone is in exactly one team.
assert.deepEqual(splitIntoTeams(['a', 'b', 'c', 'd', 'e'], 2, () => 0.999), [['a', 'c', 'e'], ['b', 'd']])
const seven = ['가', '나', '다', '라', '마', '바', '사']
const three = splitIntoTeams(seven, 3, random)
assert.deepEqual(three.map((team) => team.length), [3, 2, 2])
assert.deepEqual(three.flat().sort(), [...seven].sort())
assert.deepEqual(splitIntoTeams(['a', 'b'], 3, () => 0.999), [['a'], ['b'], []], 'fewer names than teams leaves teams empty')
assert.deepEqual(splitIntoTeams([], 2, random), [[], []])

// The number of teams the page allows: 2 up to one name each.
assert.equal(clampTeamCount(1, 10), 2)
assert.equal(clampTeamCount(4, 10), 4)
assert.equal(clampTeamCount(99, 10), 10)
assert.equal(clampTeamCount(3.6, 10), 4)
assert.equal(clampTeamCount(5, 0), 2, 'never below two, even before any name is typed')
assert.equal(clampTeamCount(Number.NaN, 10), 2)

// Picking some.
assert.deepEqual(pickSome(letters, 2, () => 0.999), ['a', 'b'])
assert.deepEqual(pickSome(letters, 2, () => 0), ['b', 'c'])
assert.deepEqual(pickSome(letters, 9, () => 0.999), letters, 'all of them when fewer are there')
assert.deepEqual(pickSome(letters, 0, random), [])
const picked = pickSome(seven, 3, random)
assert.equal(new Set(picked).size, 3, 'nobody is picked twice in one draw')
assert.ok(picked.every((name) => seven.includes(name)))

// What goes to the clipboard.
assert.equal(teamsToText([['홍길동', '김철수'], ['이영희']]), '1조: 홍길동, 김철수\n2조: 이영희')
assert.equal(orderToText(['이영희', '홍길동']), '1. 이영희\n2. 홍길동')

// The page's own randomness stays inside [0, 1).
for (let run = 0; run < 200; run += 1) {
  const value = cryptoRandom()
  assert.ok(value >= 0 && value < 1)
}

console.log('draw contract passed')
