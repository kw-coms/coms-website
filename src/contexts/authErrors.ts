const AUTH_LOAD_ERROR_MESSAGE = '로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.'

export function isLoggedOutAuthError(error) {
  // Only used for the session check (/api/auth/me), which any signed-in member may call, so a
  // 403 there can only mean "no usable session". The backend now answers that with 401; 403 is
  // still accepted because backends deployed before that change (and cached clients talking to
  // them) answered with 403.
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
