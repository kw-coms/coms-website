import { request } from './apiClient'

export type MyPermissions = {
  role: string
  permissions: string[]
}

export type PermissionDescriptor = {
  key: string
  label: string
  description: string
}

export type PermissionMatrix = {
  roles: string[]
  permissions: PermissionDescriptor[]
  allowed: Record<string, string[]>
  updatedAt?: string | null
  updatedBy?: string | null
}

// 로그인한 본인의 유효 권한 — 회장이 매트릭스를 바꾸면 다음 로드부터 반영된다.
export function getMyPermissions(): Promise<MyPermissions> {
  return request('/api/permissions/me')
}

// 회장 전용 — 직급 × 권한 매트릭스 전체.
export function getPermissionMatrix(): Promise<PermissionMatrix> {
  return request('/api/admin/permissions')
}

// 회장 전용 — 전체 치환. 회장(ADMIN)은 매트릭스에 없으므로 보낼 수 없다.
// expectedUpdatedAt: 화면이 마지막으로 읽은 matrix.updatedAt. 그 사이 다른 관리자가 먼저
// 저장했으면 서버가 409로 거부한다(낙관적 동시성 잠금) — 화면은 이를 토스트로 안내하고
// 매트릭스를 다시 불러와야 한다.
export function updatePermissionMatrix(
  allowed: Record<string, string[]>,
  expectedUpdatedAt: string | null | undefined
): Promise<PermissionMatrix> {
  return request('/api/admin/permissions', {
    method: 'PUT',
    body: JSON.stringify({ allowed, expectedUpdatedAt: expectedUpdatedAt ?? null }),
  })
}
