const AUTH_LOAD_ERROR_MESSAGE = '로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.'

export function isLoggedOutAuthError(error) {
  return Number(error?.status) === 401
}

export function buildAuthLoadError(error) {
  return {
    message: AUTH_LOAD_ERROR_MESSAGE,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    detail: error?.message || '',
  }
}
