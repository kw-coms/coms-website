import assert from 'node:assert/strict'

import {
  ROLE_LABELS,
  adminTabsForRole,
  canAccessOperationsPanel,
  canManageArchive,
  canManageContent,
  canManageSensitiveAdmin,
  canModerateCommunity,
  defaultOperationsTab,
} from '../src/utils/roleAccess.ts'

const tabs = [
  { id: 'overview' },
  { id: 'members' },
  { id: 'activities' },
  { id: 'projects' },
  { id: 'site-settings' },
  { id: 'files' },
  { id: 'community' },
  { id: 'deleted-posts' },
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

// 부회장(VICE_PRESIDENT): 임원 권한 + 커뮤니티 중재 + 자료실 관리, 민감 관리자 기능은 회장 전용.
assert.equal(canManageContent('VICE_PRESIDENT'), true)
assert.equal(canModerateCommunity('VICE_PRESIDENT'), true)
assert.equal(canModerateCommunity('ADMIN'), true)
assert.equal(canModerateCommunity('OFFICER'), false)
assert.equal(canManageArchive('VICE_PRESIDENT'), true)
assert.equal(canManageArchive('OFFICER'), false)
assert.equal(canManageSensitiveAdmin('VICE_PRESIDENT'), false)
assert.deepEqual(
  adminTabsForRole('VICE_PRESIDENT', tabs).map((tab) => tab.id),
  ['activities', 'projects', 'site-settings', 'files', 'community', 'deleted-posts'],
)
assert.equal(defaultOperationsTab('VICE_PRESIDENT', 'files'), 'files')
assert.equal(defaultOperationsTab('VICE_PRESIDENT', 'members'), 'activities')
assert.deepEqual(ROLE_LABELS, { ADMIN: '회장', VICE_PRESIDENT: '부회장', OFFICER: '임원', USER: '회원', ASSOCIATE: '준회원' })

console.log('role access policy passed')

// 준회원(ASSOCIATE): 회원과 동일하되 동아리방 비밀번호만 차단.
const { canSeeClubRoom } = await import('../src/utils/roleAccess.ts')
assert.equal(canSeeClubRoom('ASSOCIATE'), false)
assert.equal(canSeeClubRoom('USER'), true)
assert.equal(canSeeClubRoom('OFFICER'), true)
assert.equal(ROLE_LABELS.ASSOCIATE, '준회원')
assert.equal(ROLE_LABELS.USER, '회원')
assert.equal(canManageContent('ASSOCIATE'), false)
assert.equal(canModerateCommunity('ASSOCIATE'), false)
assert.deepEqual(adminTabsForRole('ASSOCIATE', tabs), [])
