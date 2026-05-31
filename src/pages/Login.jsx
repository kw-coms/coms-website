import { useState } from 'react'
import { getMe, loginUser } from '../services/authApi.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getLogoAsset } from '../utils/logoAssets.js'

export default function Login({ onBack, goSignup }) {
  const { setUser } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const panelClass = 'shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8'
  const frameClass = 'shape-cut-sm bg-black/12 p-px'
  const inputClass = 'w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 transition focus:bg-white/82 focus:ring-2 focus:ring-[var(--theme-accent)]/55'
  const btnClass = 'w-full shape-cut-sm bg-white/66 px-4 py-2.5 font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/82'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!identifier || !password) {
      setError('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const data = await loginUser({ identifier, password })
      const user = await getMe().catch(() => ({
        studentId: data.studentId,
        name: data.name,
        role: 'USER',
      }))
      setUser(user)
      // Token is stored in HttpOnly cookie by the server — not accessible from JS
      sessionStorage.setItem('studentId', data.studentId)
      sessionStorage.setItem('name', data.name)
      onBack()
    } catch (err) {
      setError(err.message || '로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className={panelClass}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="h-10 w-10 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug sm:text-xl">KW COM's 로그인</h2>
              <p className="text-sm leading-5 text-[var(--theme-body-muted)]/85">동아리 계정으로 로그인하세요.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">아이디</label>
              <div className={frameClass}>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">비밀번호</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className={inputClass}
                />
              </div>
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div>
              <div className={frameClass}>
                <button type="submit" className={btnClass} disabled={loading}>
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm text-[var(--theme-body-muted)]/90 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={goSignup} className="w-full rounded-full border border-black/10 bg-white/60 px-4 py-2 text-center font-semibold transition hover:bg-white/80 sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-left sm:underline">
                회원가입
              </button>

              <button
                type="button"
                onClick={() => alert('비밀번호 분실 문의: coms@example.com')}
                className="w-full rounded-full border border-black/10 bg-white/60 px-4 py-2 text-center font-semibold transition hover:bg-white/80 sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-left sm:underline"
              >
                비밀번호 찾기
              </button>
            </div>

            <p className="mt-4 text-xs leading-5 text-[var(--theme-body-muted)]/80">
              로그인 정보가 기억나지 않거나 계정에 문제가 있는 경우 관리팀에 문의해주세요.
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
