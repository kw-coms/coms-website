import { useEffect, useRef, useState } from 'react'
import { confirmSignupEmailVerification, requestSignupEmailVerification } from '../services/authApi'

const RESEND_COOLDOWN_SECONDS = 60

export function EmailVerifyStep({ studentId, email, onDone }: {
  studentId?: string | null
  email?: string
  onDone: () => void
}) {
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleResend = async () => {
    if (cooldown > 0) return
    setResending(true)
    setError('')
    try {
      await requestSignupEmailVerification(studentId || null, email)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setError(err.message || '재전송 중 오류가 발생했습니다.')
    } finally {
      setResending(false)
    }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (!code.trim()) { setError('인증코드를 입력해주세요.'); return }
    setVerifying(true)
    setError('')
    try {
      await confirmSignupEmailVerification(studentId || null, code.trim(), email)
      onDone()
    } catch (err) {
      setError(err.message || '인증코드가 올바르지 않습니다.')
    } finally {
      setVerifying(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-[15px] text-[#1d1d1f] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[var(--app-accent)]/24'

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--app-accent)]/20 bg-[#e8f3ff] px-4 py-3 text-sm text-[var(--app-accent-text)]">
        <p className="font-semibold">이메일로 인증코드를 발송했습니다.</p>
        <p className="mt-1 text-xs opacity-80">
          {email ? `${email} 받은편지함을 확인해주세요.` : '가입하신 이메일 받은편지함을 확인해주세요.'}{' '}
          10분 이내에 입력해야 합니다.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]">인증코드 6자리</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={verifying || code.length !== 6}
          className="w-full rounded-lg bg-[var(--app-accent)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? '인증 중...' : '인증 완료'}
        </button>
      </form>

      <div className="text-center text-sm text-[var(--theme-body-muted)]">
        이메일을 못 받으셨나요?{' '}
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-semibold text-[var(--app-accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending ? '전송 중...' : cooldown > 0 ? `재전송 (${cooldown}s)` : '코드 재전송'}
        </button>
      </div>
    </div>
  )
}
