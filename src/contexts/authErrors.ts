const AUTH_LOAD_ERROR_MESSAGE = '로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.'

export function isLoggedOutAuthError(error) {
  // The backend has no custom authentication entry point, so Spring Security's default
  // Http403ForbiddenEntryPoint answers an absent/expired/invalid token on a protected
  // endpoint with 403 — the same status as a genuine authorization denial. The two are
  // indistinguishable at the HTTP layer, so both 401 and 403 are treated as logged-out,
  // matching apiClient's refresh-retry condition.
  const status = Number(error?.status)
  return status === 401 || status === 403
}

export function buildAuthLoadError(error) {
  return {
    message: AUTH_LOAD_ERROR_MESSAGE,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    detail: error?.message || '',
  }
}
