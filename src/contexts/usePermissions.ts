import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { type PermissionKey } from '../utils/roleAccess'

/**
 * 로그인한 본인의 유효 권한. 서버(/api/permissions/me)가 아직 도착하지 않았거나
 * 실패한 동안에는 권한을 열지 않는다. 개인별 차단은 직급 기본값보다 우선한다.
 */
export function usePermissions() {
  const { permissions, permissionsSettled } = useAuth()

  const effective = useMemo(
    () => new Set<string>(permissions ?? []),
    [permissions]
  )

  return useMemo(
    () => ({
      permissions: effective,
      loaded: Boolean(permissions),
      // The request has come back, with or without an answer. After a failure `loaded` stays
      // false (no permissions are assumed) but there is nothing left to wait for.
      settled: Boolean(permissions) || Boolean(permissionsSettled),
      can: (key: PermissionKey) => effective.has(key),
    }),
    [effective, permissions, permissionsSettled]
  )
}
