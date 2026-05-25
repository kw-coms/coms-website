export default function Signup({ onBack }) {
  return (
    <section className="shape-cut border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-3xl supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8">
      <h2 className="mb-2 text-xl font-bold sm:text-2xl">회원가입</h2>
      <p className="mb-4 text-sm text-[var(--theme-body-muted)]/85">회원가입은 추후 백엔드 연동 시 진행됩니다.</p>

      <div className="space-y-3">
        <p className="text-sm text-[var(--theme-body-muted)]/80">- 회원가입 폼은 준비 중입니다.</p>
        <p className="text-sm text-[var(--theme-body-muted)]/80">- 백엔드 API가 준비되면 이 페이지에 연결됩니다.</p>

        <button
          type="button"
          onClick={onBack}
          className="mt-4 w-full shape-cut-sm bg-[var(--theme-text)] px-4 py-2 font-semibold text-[var(--theme-bg)] transition hover:scale-[1.02] sm:w-auto"
        >
          로그인으로 돌아가기
        </button>
      </div>
    </section>
  )
}
