import assert from 'node:assert/strict'
import {
  NAV_VISITS_KEY,
  addNavVisit,
  countNavVisit,
  frequentNavPaths,
  matchesNavPath,
  navPathFor,
  parseNavVisits,
  readNavVisits,
} from '../src/utils/navVisits.ts'

const paths = ['/about', '/activities', '/study', '/lab/', '/recruit', '/notices']

// Which menu item a route belongs to.
assert.equal(matchesNavPath('/study', '/study'), true)
assert.equal(matchesNavPath('/study/arduino', '/study'), true)
assert.equal(matchesNavPath('/studying', '/study'), false)
assert.equal(matchesNavPath('/lab/', '/lab/'), true, 'a path with a trailing slash still matches')
assert.equal(matchesNavPath('/lab/circuit', '/lab/'), true)
assert.equal(matchesNavPath('/recruit-notice', '/recruit'), true)
assert.equal(navPathFor('/activities', paths), '/activities')
assert.equal(navPathFor('/settings', paths), null)

// Stored data is only trusted when it is a map of positive whole numbers.
assert.deepEqual(parseNavVisits(null), {})
assert.deepEqual(parseNavVisits('not json'), {})
assert.deepEqual(parseNavVisits('[1,2]'), {})
assert.deepEqual(parseNavVisits('{"/about":2,"/x":-1,"/y":1.5,"/z":"3"}'), { '/about': 2 })

// Counting does not change its input.
const once = addNavVisit({}, '/about')
assert.deepEqual(once, { '/about': 1 })
assert.deepEqual(addNavVisit(once, '/about'), { '/about': 2 })
assert.deepEqual(once, { '/about': 1 })

// The row waits for three visits in all, then shows the top three, ties in menu order.
assert.deepEqual(frequentNavPaths({}, paths), [])
assert.deepEqual(frequentNavPaths({ '/about': 2 }, paths), [], 'two visits are not enough')
assert.deepEqual(frequentNavPaths({ '/about': 3 }, paths), ['/about'], 'three visits to one page are')
assert.deepEqual(frequentNavPaths({ '/about': 1, '/study': 1, '/notices': 1 }, paths), ['/about', '/study', '/notices'])
assert.deepEqual(
  frequentNavPaths({ '/about': 1, '/study': 5, '/notices': 3, '/recruit': 2, '/activities': 1 }, paths),
  ['/study', '/notices', '/recruit'],
)
assert.deepEqual(frequentNavPaths({ '/gone': 9, '/about': 1 }, paths), [], 'a path that left the menu is not counted')

// Storage: written under the versioned key, and a broken store never throws.
const store = new Map()
const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
countNavVisit('/about', storage)
countNavVisit('/about', storage)
assert.equal(store.get(NAV_VISITS_KEY), '{"/about":2}')
assert.deepEqual(readNavVisits(storage), { '/about': 2 })
const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } }
assert.deepEqual(readNavVisits(broken), {})
assert.deepEqual(countNavVisit('/about', broken), { '/about': 1 })

console.log('nav visits contract passed')
