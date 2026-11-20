import assert from 'node:assert/strict'
import {
  generationLabel, groupByDecade, importAction, parseOfficerPaste, splitCells, splitNames, termMatches,
} from '../src/features/clubOfficers/clubOfficers.ts'

// 가상의 이름만 쓴다(실제 명단은 저장소에 넣지 않는다).
assert.deepEqual(splitNames('가나다, 라마바 ,  사아자'), ['가나다', '라마바', '사아자'])
assert.deepEqual(splitNames('가나다，라마바、가나다'), ['가나다', '라마바'], '전각 쉼표도 나누고 중복은 한 번만')
assert.deepEqual(splitNames('  '), [])

// 탭으로 나눈 줄과 공백 2칸 이상으로 나눈 줄을 모두 읽는다.
const tabbed = parseOfficerPaste('52대\t2018\t가나다\t라마바, 사아자')
assert.deepEqual(tabbed, { rows: [{ label: '52대', year: 2018, presidents: ['가나다'], vices: ['라마바', '사아자'] }], issues: [], warnings: [] })
const spaced = parseOfficerPaste('초대   1970   가나다   라마바')
assert.deepEqual(spaced.rows, [{ label: '초대', year: 1970, presidents: ['가나다'], vices: ['라마바'] }])
assert.deepEqual(parseOfficerPaste('초대 1970 가나다 라마바').issues.map((issue) => issue.line), [1], '한 칸 공백은 칸 구분이 아니다')

// 부회장 칸은 비워도 되고, 빈 줄·윈도 줄바꿈·머리글은 넘어간다.
const mixed = parseOfficerPaste('임기\t연도\t회장\t부회장\r\n\r\n53대\t2019\t파하가\t\r\n54대\t2019년\t차카타, 나다라')
assert.equal(mixed.issues.length, 0)
assert.deepEqual(mixed.rows.map((row) => [row.label, row.year, row.vices.length]), [['53대', 2019, 0], ['54대', 2019, 0]])
assert.deepEqual(mixed.rows[1].presidents, ['차카타', '나다라'], '3칸 줄은 회장 칸까지만 읽는다')
assert.deepEqual(parseOfficerPaste('54대\t2019\t차카타').rows[0].vices, [])

// 잘못된 줄은 줄 번호와 함께 따로 모으고 나머지는 살린다.
const bad = parseOfficerPaste([
  '70대\t2026\t가나다\t라마바',
  '71대\t26\t가나다\t',
  '72대\t2027',
  '73대\t2027\t\t',
  '70대\t2028\t사아자\t',
  '\t2028\t사아자\t',
  '74대\t2027\t가\t나\t다',
  '75대\t2027\t' + '가'.repeat(41) + '\t',
  '76대\t1800\t가나다\t',
].join('\n'))
assert.deepEqual(bad.rows.map((row) => row.label), ['70대'])
assert.deepEqual(bad.issues.map((issue) => issue.line), [2, 3, 4, 5, 6, 7, 8, 9])
assert.match(bad.issues[0].message, /연도/)
assert.match(bad.issues[1].message, /칸이 부족/)
assert.match(bad.issues[2].message, /모두 비어/)
assert.match(bad.issues[3].message, /1번째 줄과 겹칩니다/)
assert.match(bad.issues[4].message, /임기 이름이 비어/)
assert.match(bad.issues[5].message, /칸이 너무 많/)
assert.match(bad.issues[6].message, /40자/)

// 미리보기: 임기 이름이 키이고, 같은 내용이면 '변경 없음'.
const existing = [{ label: '52대', year: 2018, officers: [{ role: 'PRESIDENT', name: '가나다' }, { role: 'VICE_PRESIDENT', name: '라마바' }] }]
const row = (label, year, presidents, vices) => ({ label, year, presidents, vices })
assert.equal(importAction(row('53대', 2019, ['가'], []), existing), 'create')
assert.equal(importAction(row('52대', 2018, ['가나다'], ['라마바']), existing), 'same')
assert.equal(importAction(row('52대', 2019, ['가나다'], ['라마바']), existing), 'update')
assert.equal(importAction(row('52대', 2018, ['가나다'], []), existing), 'update')
assert.equal(importAction(row('52대', 2018, ['가나다'], ['사아자']), existing), 'update')

// 기수 표기: '50' 도 '50기' 도 '50기'.
assert.equal(generationLabel('50'), '50기')
assert.equal(generationLabel('50기'), '50기')
assert.equal(generationLabel(null), '')
assert.equal(generationLabel('  '), '')

// 10년 단위 묶기: 입력 순서(연도 내림차순)를 지킨다.
const term = (id, label, year, officers = []) => ({ id, label, year, position: 0, note: '', officers })
const groups = groupByDecade([term(1, '71대', 2026), term(2, '70대', 2026), term(3, '69대', 2019), term(4, '초대', 1970)])
assert.deepEqual(groups.map((group) => [group.title, group.terms.map((item) => item.label)]),
  [['2020년대', ['71대', '70대']], ['2010년대', ['69대']], ['1970년대', ['초대']]])
assert.deepEqual(groupByDecade([]), [])

// 검색: 이름·연도·임기 이름·기수, 여러 단어는 모두 들어 있어야 한다.
const sample = term(9, '52대', 2018, [{ id: 1, role: 'PRESIDENT', name: '가나다', generation: '50' }, { id: 2, role: 'VICE_PRESIDENT', name: '라마바', generation: null }])
for (const [query, expected] of [
  ['', true], ['가나다', true], ['나다', true], ['2018', true], ['2018년', true], ['52대', true], ['52 대', true],
  ['50기', true], ['가나다 2018', true], ['라마바 50기', true], ['사아자', false], ['2019', false], ['가나다 2019', false],
]) assert.equal(termMatches(query, sample), expected, `query "${query}"`)

// 7. 끝의 빈 칸은 칸 수에서 빼고, 전각 공백(U+3000)도 칸 구분이다.
assert.deepEqual(parseOfficerPaste('52대\t2018\t가나다\t\t\t').rows, [{ label: '52대', year: 2018, presidents: ['가나다'], vices: [] }], '끝의 빈 칸이 여럿이어도 4칸 제한에 걸리지 않는다')
assert.deepEqual(parseOfficerPaste('52대\t2018\t가나다\t라마바\t\t').issues, [])
assert.deepEqual(parseOfficerPaste('52대\u30002018\u3000가나다\u3000라마바').rows, [{ label: '52대', year: 2018, presidents: ['가나다'], vices: ['라마바'] }])
assert.deepEqual(parseOfficerPaste('52대\u3000\u3000\u30002018\u3000가나다').rows.map((row) => row.label), ['52대'], '전각 공백은 몇 개가 이어져도 한 구분')
assert.deepEqual(splitCells('a  b\u3000c'), ['a', 'b', 'c'])
assert.deepEqual(splitCells('a\tb\t\t'), ['a', 'b'])
assert.match(parseOfficerPaste('52대\t2018\t\t').issues[0].message, /모두 비어/)
assert.match(parseOfficerPaste('52대\t2018').issues[0].message, /칸이 부족/)

// 8. 대시·없음·x 만 있는 칸은 빈 칸이다.
for (const mark of ['-', '–', '—', '없음', 'x', 'X']) {
  assert.deepEqual(parseOfficerPaste(`52대\t2018\t가나다\t${mark}`).rows[0].vices, [], `"${mark}"`)
  assert.deepEqual(splitNames(mark), [])
}
assert.equal(parseOfficerPaste('52대\t2018\t-\t없음').issues.length, 1, '두 칸 모두 빈 칸이면 줄을 거절한다')
assert.deepEqual(splitNames('x가나다'), ['x가나다'], '이름에 섞인 x 는 이름이다')

// 9. 괄호 메모와 쉼표: 괄호 안의 쉼표로는 나누지 않고, 끝의 (…) 는 떼서 경고로 알린다.
const notes = []
assert.deepEqual(splitNames('가나다(회장 대행), 라마바', (message) => notes.push(message)), ['가나다', '라마바'])
assert.deepEqual(notes, ['가나다(회장 대행) → 이름 가나다, 메모 무시됨'])
assert.deepEqual(splitNames('가나다(1학기, 대행), 라마바'), ['가나다', '라마바'], '괄호 안 쉼표는 나누지 않는다')
assert.deepEqual(splitNames('가나다（대행）'), ['가나다'], '전각 괄호도 같다')
const spaced2 = []
assert.deepEqual(splitNames('가 나다', (message) => spaced2.push(message)), ['가 나다'])
assert.deepEqual(spaced2, ["'가 나다': 한 칸에 이름이 둘이면 쉼표로 구분하세요"])
const quiet = []
splitNames('가나다, 라마바', (message) => quiet.push(message))
assert.deepEqual(quiet, [], '쉼표로 나눈 이름에는 경고가 없다')
const withWarn = parseOfficerPaste('52대\t2018\t가나다(회장 대행)\t라마바 사아자')
assert.deepEqual(withWarn.rows[0].presidents, ['가나다'])
assert.deepEqual(withWarn.issues, [])
assert.deepEqual(withWarn.warnings.map((warning) => [warning.line, warning.message]), [
  [1, '가나다(회장 대행) → 이름 가나다, 메모 무시됨'],
  [1, "'라마바 사아자': 한 칸에 이름이 둘이면 쉼표로 구분하세요"],
])
assert.deepEqual(parseOfficerPaste('52대\t99\t가(나)\t').warnings, [], '거절된 줄의 경고는 남기지 않는다')

// 12. 연도는 검색어가 연도 그대로이거나 '<연도>년' 일 때만 맞고, 나머지는 이름·임기 이름 부분 일치.
const old = term(8, '초대', 1952, [{ id: 3, role: 'PRESIDENT', name: '가나다', generation: null }])
for (const [query, expected] of [['52', false], ['195', false], ['1952', true], ['1952년', true], ['52년', false], ['초대', true], ['가나', true]]) {
  assert.equal(termMatches(query, old), expected, `old "${query}"`)
}
assert.equal(termMatches('52', term(9, '52대', 2018)), true, '52 는 임기 이름 52대 에 맞는다')
assert.equal(termMatches('2018 년', sample), true, '떨어진 년 은 연도 접미사')
assert.equal(termMatches('2019 년', sample), false)
assert.equal(termMatches('가나다 2018 년', sample), true)
assert.equal(termMatches('201', sample), false)
assert.equal(termMatches('18', sample), false)
assert.equal(termMatches('가나다 2018년', sample), true)

// 괄호가 닫히지 않은 칸은 경고한다.
const open = []
splitNames('가나다(대행, 라마바', (message) => open.push(message))
assert.deepEqual(open, ["'가나다(대행, 라마바': 괄호가 닫히지 않았습니다"])
const balanced = []
splitNames('가나다(대행), 라마바', (message) => balanced.push(message))
assert.equal(balanced.some((message) => message.includes('닫히지')), false)
assert.equal(parseOfficerPaste('52대\t2018\t가나다(대행\t').warnings.some((warning) => warning.message.includes('닫히지')), true)

console.log('clubOfficers: ok')
