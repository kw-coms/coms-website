import assert from 'node:assert/strict'

import {
  adminTabsForRole,
  canAccessOperationsPanel,
  canManageContent,
  canManageSensitiveAdmin,
  defaultOperationsTab,
} from '../src/utils/roleAccess.ts'

const tabs = [
  { id: 'overview' },
  { id: 'members' },
  { id: 'activities' },
  { id: 'projects' },
  { id: 'site-settings' },
  { id: 'logs' },
]

assert.equal(canManageContent('ADMIN'), true)
assert.equal(canManageContent('OFFICER'), true)
assert.equal(canManageContent('USER'), false)
assert.equal(canManageSensitiveAdmin('ADMIN'), true)
assert.equal(canManageSensitiveAdmin('OFFICER'), false)
assert.equal(canAccessOperationsPanel('OFFICER'), true)
assert.equal(canAccessOperationsPanel('USER'), false)

assert.deepEqual(
  adminTabsForRole('OFFICER', tabs).map((tab) => tab.id),
  ['activities', 'projects', 'site-settings'],
)
assert.deepEqual(adminTabsForRole('ADMIN', tabs), tabs)
assert.equal(defaultOperationsTab('OFFICER', 'members'), 'activities')
assert.equal(defaultOperationsTab('OFFICER', 'projects'), 'projects')
assert.equal(defaultOperationsTab('ADMIN', 'members'), 'members')

console.log('role access policy passed')
