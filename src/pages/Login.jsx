import { useState } from 'react'
import { loginUser, requestSignupEmailVerification } from '../services/authApi.js'
import { useAuth } from '../contexts/useAuth.js'
import { getLogoAsset } from '../utils/logoAssets.js'
import { EmailVerifyStep } from '../components/EmailVerifyStep.jsx'

export default function Login({ onCancel, onSuccess, goSignup }) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('login')
  const [verifyStudentId, setVerifyStudentId] = useState('')
  const [verifyError, setVerifyError] = useState('')

  const panelClass = 'shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8'
  const frameClass = 'shape-cut-sm bg-black/12 p-px'
  const inputClass = 'w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 transition focus:bg-white/82 focus:ring-2 focus:ring-[var(--theme-accent)]/55'
  const btnClass = 'w-full shape-cut-sm bg-white/66 px-4 py-2.5 font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/82'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const trimmedIdentifier = identifier.trim()
    const submittedPassword = password

    if (!trimmedIdentifier || !submittedPassword) {
      setError('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const data = await loginUser({ identifier: trimmedIdentifier, password: submittedPassword, rememberMe })
      await login(data)
      onSuccess()
    } catch (err) {
      const msg = err.message || '로그인 중 오류가 발생했습니다.'
      if (msg.includes('이메일 인증')) {
        setVerifyStudentId(trimmedIdentifier)
        try {
          await requestSignupEmailVerification(trimmedIdentifier)
        } catch {
          // 429 cooldown: existing code still valid; other errors: user can resend when ready
        }
        setStep('verify')
        setVerifyError('')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerified = async () => {
    setLoading(true)
    setVerifyError('')
    try {
      const data = await loginUser({ identifier: verifyStudentId, password, rememberMe })
      await login(data)
      onSuccess()
    } catch (err) {
      // Stay on verify step — verification succeeded, login failure is likely transient
      setVerifyError(err.message || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const isVerifyStep = step === 'verify'

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={isVerifyStep ? () => setStep('login') : onCancel}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          {isVerifyStep ? '로그인으로 돌아가기' : '메인으로 돌아가기'}
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className={panelClass}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="h-10 w-10 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug sm:text-xl">
                {isVerifyStep ? '이메일 인증' : 'KW COM\'s 로그인'}
              </h2>
              <p className="text-sm leading-5 text-[var(--theme-body-muted)]/85">
                {isVerifyStep ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.' : '동아리 계정으로 로그인하세요.'}
              </p>
            </div>
          </div>

          {isVerifyStep ? (
            <div className="space-y-4">
              {verifyError && <div className="text-sm text-red-400">{verifyError}</div>}
              <EmailVerifyStep studentId={verifyStudentId} onDone={handleVerified} />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">학번 (Student ID)</label>
                <div className={frameClass}>
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="학번을 입력하세요"
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

              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--theme-body-muted)]/90">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 accent-[var(--theme-accent)]"
                />
                자동 로그인
              </label>

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
                  onClick={() => alert('비밀번호 분실 문의: kwcoms69@gmail.com')}
                  className="w-full rounded-full border border-black/10 bg-white/60 px-4 py-2 text-center font-semibold transition hover:bg-white/80 sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-left sm:underline"
                >
                  비밀번호 찾기
                </button>
              </div>

              <p className="mt-4 text-xs leading-5 text-[var(--theme-body-muted)]/80">
                로그인 정보가 기억나지 않거나 계정에 문제가 있는 경우 관리팀에 문의해주세요.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
