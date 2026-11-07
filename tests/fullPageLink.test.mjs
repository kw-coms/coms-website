import assert from 'node:assert/strict'

import { isFullPageLink } from '../src/utils/fullPageLink.ts'

assert.equal(isFullPageLink('/lab/'), true)
assert.equal(isFullPageLink('/lab'), true)
assert.equal(isFullPageLink('/lab/anything'), true)
assert.equal(isFullPageLink('/labs'), false, 'only the /lab app, not a path that merely starts with it')
assert.equal(isFullPageLink('/gatherings'), false)
assert.equal(isFullPageLink({ pathname: '/lab/' }), false, 'a router location object is not a plain path')
