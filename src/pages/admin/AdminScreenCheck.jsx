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
        <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">배포 전 화면 점검</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          `npm run smoke`와 같은 핵심 공개 경로를 관리자 화면에서 바로 열어봅니다. 배포 직전 라우팅, 폰트, 회원가입, 지원하기 화면이 깨지지 않았는지 빠르게 확인할 때 사용합니다.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">Smoke 대상 경로</p>
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
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">API 상태 확인 표면</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SCREEN_CHECK_APIS.map((api) => (
            <div key={api.path} className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-3">
              <span className="block text-xs font-semibold text-[var(--theme-body-muted)]">{api.label}</span>
              <span className="mt-1 block break-all font-mono text-sm text-[var(--theme-body-dark)]">{api.path}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--theme-body-muted)]">
          자동 판정은 Playwright smoke가 담당합니다. 이 탭은 운영자가 브라우저에서 직접 눈으로 확인할 체크리스트입니다.
        </p>
      </div>
    </div>
  )
}
