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
export function updatePermissionMatrix(allowed: Record<string, string[]>): Promise<PermissionMatrix> {
  return request('/api/admin/permissions', {
    method: 'PUT',
    body: JSON.stringify({ allowed }),
  })
}
