import assert from 'node:assert/strict'

import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_LABELS,
  adminTabsForRole,
  canAccessOperationsPanel,
  canEditSiteSettings,
  canManageArchive,
  canManageContent,
  canManageProjects,
  canManageSensitiveAdmin,
  canModerateCommunity,
  canSeeClubRoom,
  canUseAnonymousBoard,
  canWriteNotice,
  defaultOperationsTab,
  defaultPermissionsForRole,
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
  { id: 'permissions' },
  { id: 'logs' },
]

// 권한 게이트는 이제 직급이 아니라 권한 집합을 받는다.
const of = (role) => defaultPermissionsForRole(role)

// ---- 기본값 거울: backend com.coms.backend.domain.Permission 의 defaultRoles 와 같아야 한다.
assert.deepEqual(ALL_PERMISSION_KEYS, [
  'club_room.view',
  'community.anonymous_board',
  'community.moderate',
  'notice.write',
  'activity.write',
  'project.write',
  'archive.manage',
  'site_settings.edit',
  'operations.panel',
])
assert.deepEqual(of('ASSOCIATE'), [])
assert.deepEqual(of('USER'), ['club_room.view', 'community.anonymous_board'])
assert.deepEqual(of('OFFICER'), [
  'club_room.view',
  'community.anonymous_board',
  'notice.write',
  'activity.write',
  'project.write',
  'site_settings.edit',
  'operations.panel',
])
assert.deepEqual(of('VICE_PRESIDENT'), [
  'club_room.view',
  'community.anonymous_board',
  'community.moderate',
  'notice.write',
  'activity.write',
  'project.write',
  'archive.manage',
  'site_settings.edit',
  'operations.panel',
])
// 회장은 매트릭스 밖 — 언제나 전부.
assert.deepEqual(of('ADMIN'), ALL_PERMISSION_KEYS)
assert.deepEqual(of(null), [])
assert.deepEqual(of('UNKNOWN'), [])

// ---- 기본 매트릭스에서 오늘의 동작이 그대로 재현되는지.
assert.equal(canManageContent(of('ADMIN')), true)
assert.equal(canManageContent(of('OFFICER')), true)
assert.equal(canManageContent(of('USER')), false)
assert.equal(canWriteNotice(of('OFFICER')), true)
assert.equal(canWriteNotice(of('USER')), false)
assert.equal(canManageProjects(of('OFFICER')), true)
assert.equal(canManageProjects(of('USER')), false)
assert.equal(canEditSiteSettings(of('OFFICER')), true)
assert.equal(canEditSiteSettings(of('USER')), false)
assert.equal(canManageSensitiveAdmin('ADMIN'), true)
assert.equal(canManageSensitiveAdmin('OFFICER'), false)
assert.equal(canAccessOperationsPanel(of('OFFICER')), true)
assert.equal(canAccessOperationsPanel(of('USER')), false)
assert.equal(canAccessOperationsPanel(of('ASSOCIATE')), false)

assert.deepEqual(
  adminTabsForRole('OFFICER', of('OFFICER'), tabs).map((tab) => tab.id),
  ['activities', 'projects', 'site-settings'],
)
assert.deepEqual(adminTabsForRole('ADMIN', of('ADMIN'), tabs), tabs)
assert.equal(defaultOperationsTab('OFFICER', of('OFFICER'), 'members'), 'activities')
assert.equal(defaultOperationsTab('OFFICER', of('OFFICER'), 'projects'), 'projects')
assert.equal(defaultOperationsTab('ADMIN', of('ADMIN'), 'members'), 'members')

// 부회장(VICE_PRESIDENT): 임원 권한 + 커뮤니티 중재 + 자료실 관리, 민감 관리자 기능은 회장 전용.
assert.equal(canManageContent(of('VICE_PRESIDENT')), true)
assert.equal(canModerateCommunity(of('VICE_PRESIDENT')), true)
assert.equal(canModerateCommunity(of('ADMIN')), true)
assert.equal(canModerateCommunity(of('OFFICER')), false)
assert.equal(canManageArchive(of('VICE_PRESIDENT')), true)
assert.equal(canManageArchive(of('OFFICER')), false)
assert.equal(canManageSensitiveAdmin('VICE_PRESIDENT'), false)
assert.deepEqual(
  adminTabsForRole('VICE_PRESIDENT', of('VICE_PRESIDENT'), tabs).map((tab) => tab.id),
  ['activities', 'projects', 'site-settings', 'files', 'community', 'deleted-posts'],
)
assert.equal(defaultOperationsTab('VICE_PRESIDENT', of('VICE_PRESIDENT'), 'files'), 'files')
assert.equal(defaultOperationsTab('VICE_PRESIDENT', of('VICE_PRESIDENT'), 'members'), 'activities')
assert.deepEqual(ROLE_LABELS, { ADMIN: '회장', VICE_PRESIDENT: '부회장', OFFICER: '임원', USER: '회원', ASSOCIATE: '준회원' })

// 준회원(ASSOCIATE): 회원과 동일하되 동아리방 비밀번호와 익명게시판이 닫혀 있다.
assert.equal(canSeeClubRoom(of('ASSOCIATE')), false)
assert.equal(canSeeClubRoom(of('USER')), true)
assert.equal(canSeeClubRoom(of('OFFICER')), true)
assert.equal(canUseAnonymousBoard(of('ASSOCIATE')), false)
assert.equal(canUseAnonymousBoard(of('USER')), true)
assert.equal(ROLE_LABELS.ASSOCIATE, '준회원')
assert.equal(ROLE_LABELS.USER, '회원')
assert.equal(canManageContent(of('ASSOCIATE')), false)
assert.equal(canModerateCommunity(of('ASSOCIATE')), false)
assert.deepEqual(adminTabsForRole('ASSOCIATE', of('ASSOCIATE'), tabs), [])

// ---- 회장이 조정한 매트릭스를 그대로 따르는지(기본값이 아니라 서버가 준 집합이 답이다).
const officerWithModeration = [...of('OFFICER'), PERMISSIONS.communityModerate]
assert.equal(canModerateCommunity(officerWithModeration), true)
assert.deepEqual(
  adminTabsForRole('OFFICER', officerWithModeration, tabs).map((tab) => tab.id),
  ['activities', 'projects', 'site-settings', 'community', 'deleted-posts'],
)

const memberWithClubRoomOnly = [PERMISSIONS.clubRoomView]
assert.equal(canSeeClubRoom(memberWithClubRoomOnly), true)
// 동방 비번만 열어준 회원은 운영 패널에 들어오지 못한다.
assert.equal(canAccessOperationsPanel(memberWithClubRoomOnly), false)

const memberWithArchive = [PERMISSIONS.archiveManage]
assert.equal(canAccessOperationsPanel(memberWithArchive), true)
assert.deepEqual(adminTabsForRole('USER', memberWithArchive, tabs).map((tab) => tab.id), ['files'])
assert.equal(defaultOperationsTab('USER', memberWithArchive, 'members'), 'files')

// 임원에게서 모든 운영 권한을 회수하면 운영 패널도 닫힌다.
assert.equal(canAccessOperationsPanel([]), false)
assert.deepEqual(adminTabsForRole('OFFICER', [], tabs), [])
// Set 도 그대로 받는다(usePermissions 가 Set 을 준다).
assert.equal(canManageContent(new Set(of('OFFICER'))), true)
assert.equal(canManageContent(null), false)

console.log('role access policy passed')
