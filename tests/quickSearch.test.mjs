import assert from 'node:assert/strict'
import { QUICK_GROUPS, initialsOf, moveQuickIndex, quickDate, quickScore, searchQuickItems } from '../src/utils/quickSearch.ts'

const item = (id, group, title, extra = {}) => ({ id, group, title, path: `/${id}`, ...extra })

// The first consonant of each Hangul syllable; other characters stay, spaces go.
assert.equal(initialsOf('출석 체크'), 'ㅊㅅㅊㅋ')
assert.equal(initialsOf('웹 세미나 3주차'), 'ㅇㅅㅁㄴ3ㅈㅊ')
assert.equal(initialsOf('Apps 모음'), 'appsㅁㅇ')
assert.equal(initialsOf('까치'), 'ㄲㅊ', 'a doubled consonant is its own initial')
assert.equal(initialsOf(''), '')
assert.equal(initialsOf(null), '')

// How well an item answers a query.
const notices = item('notices', 'page', '공지사항', { hint: 'Notices', keywords: '알림 소식' })
assert.equal(quickScore(notices, ''), 1, 'no query matches everything')
assert.equal(quickScore(notices, '   '), 1)
assert.equal(quickScore(notices, '공지'), 4, 'the start of the title counts most')
assert.equal(quickScore(notices, '지사'), 3, 'inside the title next')
assert.equal(quickScore(notices, 'notice'), 1, 'the hint and the keywords least')
assert.equal(quickScore(notices, '소식'), 1)
assert.equal(quickScore(notices, '공지 소식'), 5, 'every word is counted')
assert.equal(quickScore(notices, '공지 없는말'), 0, 'every word has to be found')
assert.equal(quickScore(item('apps', 'page', 'Apps'), 'APPS'), 4, 'case does not matter')
assert.equal(quickScore(item('s', 'notice', '웹 세미나 3주차'), '웹세미나'), 4, 'nor do spaces')
assert.equal(quickScore(item('s', 'notice', '웹 세미나 3주차'), '세미나 웹'), 7, 'nor the order of the words')

// A query made only of initial consonants is matched against the title's initials.
const attendance = item('attendance', 'page', '출석 체크')
assert.equal(quickScore(attendance, 'ㅊㅅ'), 4)
assert.equal(quickScore(attendance, 'ㅊㅅ ㅊㅋ'), 4)
assert.equal(quickScore(attendance, 'ㅅㅊ'), 3)
assert.equal(quickScore(attendance, 'ㅎㅎ'), 0)
assert.equal(quickScore(attendance, 'ㅊ석'), 0, 'initials mixed with syllables are read as plain text')
assert.equal(quickScore(item('k', 'post', 'ㅋㅋㅋ 웃긴 글'), 'ㅋㅋ'), 4, 'a title that itself holds bare consonants is still found')

const items = [
  item('home', 'page', '홈'),
  item('notices', 'page', '공지사항'),
  item('community', 'page', '커뮤니티'),
  item('n1', 'notice', '개강 총회 공지'),
  item('n2', 'notice', '공지: 세미나 일정'),
  item('n3', 'notice', '회비 안내'),
  item('p1', 'post', '세미나 후기'),
  item('f1', 'file', '세미나 발표 자료', { keywords: 'seminar.pdf' }),
  item('m1', 'poll', '세미나 뒤풀이 날짜'),
]

// With no query the dialog is a menu: the pages, all of them, and nothing else.
const menu = searchQuickItems(items, '', 2)
assert.deepEqual(menu.map((group) => group.key), ['page'])
assert.deepEqual(menu[0].items.map((entry) => entry.id), ['home', 'notices', 'community'], 'not cut to the cap')
assert.equal(menu[0].start, 0)

// Groups come in their fixed order, only those with a match; better matches first.
const found = searchQuickItems(items, '공지')
assert.deepEqual(found.map((group) => group.key), ['page', 'notice'])
assert.deepEqual(found[0].items.map((entry) => entry.id), ['notices'])
assert.deepEqual(found[1].items.map((entry) => entry.id), ['n2', 'n1'], 'a title that starts with the word comes before one that holds it')
// `start` is each group's place in the one list the arrow keys walk.
assert.deepEqual(found.map((group) => group.start), [0, 1])

const seminar = searchQuickItems(items, '세미나')
assert.deepEqual(seminar.map((group) => group.key), ['notice', 'post', 'file', 'poll'])
assert.deepEqual(seminar.map((group) => group.start), [0, 1, 2, 3])
assert.deepEqual(seminar.map((group) => group.label), ['공지사항', '커뮤니티', '자료실', '일정 조율'])
assert.deepEqual(searchQuickItems(items, 'seminar.pdf').map((group) => group.items[0].id), ['f1'], 'keywords are searched')
assert.deepEqual(searchQuickItems(items, '없는 말'), [])

// At most `perGroup` per group, and ties keep the order the items came in.
const many = Array.from({ length: 8 }, (_, index) => item(`n${index}`, 'notice', `세미나 ${index}주차`))
assert.deepEqual(searchQuickItems(many, '세미나', 3)[0].items.map((entry) => entry.id), ['n0', 'n1', 'n2'])
assert.equal(searchQuickItems(many, '세미나')[0].items.length, 5, 'five by default')

assert.deepEqual(QUICK_GROUPS.map((group) => group.key), ['page', 'notice', 'post', 'file', 'poll'])

// The highlight wraps round both ends and stays put in an empty list.
assert.equal(moveQuickIndex(0, 1, 3), 1)
assert.equal(moveQuickIndex(2, 1, 3), 0)
assert.equal(moveQuickIndex(0, -1, 3), 2)
assert.equal(moveQuickIndex(0, 1, 0), 0)
assert.equal(moveQuickIndex(5, -1, 0), 0)

assert.equal(quickDate('2026-10-03T12:00:00'), '10월 3일')
assert.equal(quickDate('nope'), '')
assert.equal(quickDate(null), '')

console.log('quick search contract passed')
