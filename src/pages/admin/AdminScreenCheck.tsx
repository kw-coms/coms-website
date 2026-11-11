const SCREEN_CHECK_ROUTES = [
  { path: '/', label: '홈' },
  { path: '/activities', label: '활동' },
  { path: '/projects', label: '프로젝트' },
  { path: '/notices', label: '공지' },
  { path: '/login', label: '로그인' },
  { path: '/signup', label: '회원가입' },
  { path: '/recruit', label: '지원하기' },
]

const SCREEN_CHECK_APIS = [
  { path: '/api/auth/me', label: '로그인 상태' },
  { path: '/api/fonts', label: '폰트 목록' },
  { path: '/api/notices', label: '공지 목록' },
]

export default function AdminScreenCheck() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">수동 점검 바로가기</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          이 탭은 아무것도 자동으로 검사하지 않습니다. 핵심 공개 화면과 API 주소를 새 탭에서 열어, 배포 직전에 직접 눈으로 확인할 때 쓰는 바로가기입니다.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">직접 열어볼 화면</p>
        <div data-testid="screen-check-routes" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCREEN_CHECK_ROUTES.map((route) => (
            <a
              key={route.path}
              href={route.path}
              target="_blank"
              rel="noreferrer"
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-3 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface)]"
            >
              <span className="block text-xs text-[var(--theme-body-muted)]">{route.label}</span>
              <span className="mt-1 block font-mono">{route.path}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">직접 열어볼 API 주소</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SCREEN_CHECK_APIS.map((api) => (
            <a
              key={api.path}
              href={api.path}
              target="_blank"
              rel="noreferrer"
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-3 transition hover:bg-[var(--app-surface)]"
            >
              <span className="block text-xs font-semibold text-[var(--theme-body-muted)]">{api.label}</span>
              <span className="mt-1 block break-all font-mono text-sm text-[var(--theme-body-dark)]">{api.path}</span>
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--theme-body-muted)]">
          자동 검사는 개발 쪽 테스트(Playwright)가 맡습니다. 여기서는 응답을 눈으로 확인하는 것까지만 할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
