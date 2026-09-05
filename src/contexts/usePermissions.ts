import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { defaultPermissionsForRole, type PermissionKey } from '../utils/roleAccess'

/**
 * 로그인한 본인의 유효 권한. 서버(/api/permissions/me)가 아직 도착하지 않았거나
 * 실패한 동안에는 직급 기본값(roleAccess 의 거울 표)으로 대신한다 — 화면이
 * 잠깐 비어 보이지 않게 하되, 실제 판정은 언제나 백엔드가 다시 한다.
 */
export function usePermissions() {
  const { user, permissions } = useAuth()
  const role = user?.role

  const effective = useMemo(
    () => new Set<string>(permissions ?? defaultPermissionsForRole(role)),
    [permissions, role]
  )

  return useMemo(
    () => ({
      permissions: effective,
      loaded: Boolean(permissions),
      can: (key: PermissionKey) => effective.has(key),
    }),
    [effective, permissions]
  )
}
