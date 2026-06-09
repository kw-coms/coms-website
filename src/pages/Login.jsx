import { useState } from 'react'
import { ArrowLeft, KeyRound, LogIn, Mail, RotateCcw, UserPlus } from 'lucide-react'
import {
  confirmPasswordReset,
  loginUser,
  requestPasswordReset,
  requestSignupEmailVerification,
} from '../services/authApi.js'
import { useAuth } from '../contexts/useAuth.js'
import { getLogoAsset } from '../utils/logoAssets.js'
import { EmailVerifyStep } from '../components/EmailVerifyStep.jsx'

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])(?!.*\s).{8,}$/

const panelClass =
  'rounded-lg border border-black/10 bg-white/86 p-5 text-[#1d1d1f] shadow-[0_24px_70px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:p-8'
const frameClass = 'rounded-lg bg-black/10 p-px'
const inputClass =
  'w-full rounded-lg bg-white px-4 py-3 text-[#1d1d1f] outline-none placeholder:text-[#86868b] transition focus:ring-2 focus:ring-[#0071e3]/24'
const btnClass =
  'flex w-full items-center justify-center gap-2 rounded-lg bg-[#0071e3] px-4 py-3 font-semibold text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-60'
const linkButtonClass =
  'w-full rounded-full border border-black/10 bg-white/70 px-4 py-2 text-center font-semibold text-[#0066cc] transition hover:bg-white sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-left'

const emptyResetForm = {
  email: '',
  code: '',
  newPassword: '',
  newPasswordConfirm: '',
}

function TextInput({ id, label, value, onChange, type = 'text', placeholder, autoComplete, inputMode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">{label}</label>
      <div className={frameClass}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className={inputClass}
        />
      </div>
    </div>
  )
}

function ActionButton({ children, icon: Icon, loading = false, ...props }) {
  return (
    <div className={frameClass}>
      <button type="submit" className={btnClass} disabled={loading} {...props}>
        {Icon && <Icon size={16} aria-hidden="true" />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default function Login({ onCancel, onSuccess, goSignup }) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('login')
  const [verifyStudentId, setVerifyStudentId] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [resetForm, setResetForm] = useState(emptyResetForm)
  const [resetRequested, setResetRequested] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const isVerifyStep = step === 'verify'
  const isResetStep = step === 'reset'

  const stepTitle = isVerifyStep ? '이메일 인증' : isResetStep ? '비밀번호 찾기' : 'KW COM\'s 로그인'
  const stepDescription = isVerifyStep
    ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.'
    : isResetStep
      ? '가입 이메일로 인증코드를 받아 새 비밀번호를 설정하세요.'
      : '동아리 계정으로 로그인하세요.'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')

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
      // Stay on verify step: verification succeeded, login failure is likely transient.
      setVerifyError(err.message || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const openResetStep = () => {
    setStep('reset')
    setError('')
    setNotice('')
    setResetError('')
    setResetMessage('')
    setResetRequested(false)
    setResetForm((current) => ({
      ...emptyResetForm,
      email: identifier.includes('@') ? identifier.trim() : current.email,
    }))
  }

  const updateResetForm = (field) => (e) => {
    setResetForm((current) => ({ ...current, [field]: e.target.value }))
  }

  const requestResetCode = async () => {
    const email = resetForm.email.trim()

    if (!email) {
      setResetError('가입 이메일을 입력해주세요.')
      return
    }
    if (!email.includes('@')) {
      setResetError('올바른 이메일 형식이 아닙니다.')
      return
    }

    setResetLoading(true)
    setResetError('')
    try {
      const result = await requestPasswordReset({ email })
      setResetRequested(true)
      setResetMessage(result.message || '입력 정보와 일치하는 계정이 있다면 인증코드를 이메일로 보냈습니다.')
    } catch (err) {
      setResetError(err.message || '인증코드 요청 중 오류가 발생했습니다.')
    } finally {
      setResetLoading(false)
    }
  }

  const confirmResetCode = async () => {
    const email = resetForm.email.trim()
    const code = resetForm.code.trim()
    const newPassword = resetForm.newPassword

    if (!/^\d{6}$/.test(code)) {
      setResetError('인증코드는 숫자 6자리여야 합니다.')
      return
    }
    if (!PASSWORD_PATTERN.test(newPassword)) {
      setResetError('비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다.')
      return
    }
    if (newPassword !== resetForm.newPasswordConfirm) {
      setResetError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setResetLoading(true)
    setResetError('')
    try {
      await confirmPasswordReset({ email, code, newPassword })
      setIdentifier(email)
      setPassword('')
      setStep('login')
      setResetForm(emptyResetForm)
      setResetRequested(false)
      setNotice('비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.')
    } catch (err) {
      setResetError(err.message || '비밀번호 재설정 중 오류가 발생했습니다.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleResetSubmit = async (e) => {
    e.preventDefault()
    if (resetRequested) {
      await confirmResetCode()
    } else {
      await requestResetCode()
    }
  }

  const goBack = () => {
    if (isVerifyStep || isResetStep) {
      setStep('login')
      return
    }
    onCancel()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {isVerifyStep || isResetStep ? '로그인으로 돌아가기' : '메인으로 돌아가기'}
        </button>
      </div>

      <div className="rounded-lg bg-white/70 p-px shadow-[0_24px_70px_rgba(0,0,0,0.1)]">
        <section className={panelClass}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="h-10 w-10 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug sm:text-xl">{stepTitle}</h2>
              <p className="break-keep text-sm leading-5 text-[var(--theme-body-muted)]/85">{stepDescription}</p>
            </div>
          </div>

          {isVerifyStep ? (
            <div className="space-y-4">
              {verifyError && <div className="text-sm text-red-500">{verifyError}</div>}
              <EmailVerifyStep studentId={verifyStudentId} onDone={handleVerified} />
            </div>
          ) : isResetStep ? (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <TextInput
                id="resetEmail"
                label="가입 이메일"
                type="email"
                value={resetForm.email}
                onChange={updateResetForm('email')}
                placeholder="가입한 이메일을 입력하세요"
                autoComplete="email"
              />

              {resetRequested && (
                <div className="space-y-4">
                  <TextInput
                    id="resetCode"
                    label="인증코드"
                    value={resetForm.code}
                    onChange={updateResetForm('code')}
                    placeholder="숫자 6자리"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                  <TextInput
                    id="resetNewPassword"
                    label="새 비밀번호"
                    type="password"
                    value={resetForm.newPassword}
                    onChange={updateResetForm('newPassword')}
                    placeholder="영문+숫자+특수문자 8자 이상"
                    autoComplete="new-password"
                  />
                  <TextInput
                    id="resetNewPasswordConfirm"
                    label="새 비밀번호 확인"
                    type="password"
                    value={resetForm.newPasswordConfirm}
                    onChange={updateResetForm('newPasswordConfirm')}
                    placeholder="새 비밀번호를 다시 입력하세요"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {resetMessage && <div className="text-sm text-emerald-700">{resetMessage}</div>}
              {resetError && <div className="text-sm text-red-500">{resetError}</div>}

              <ActionButton icon={resetRequested ? KeyRound : Mail} loading={resetLoading}>
                {resetLoading ? '처리 중...' : resetRequested ? '비밀번호 재설정' : '인증코드 받기'}
              </ActionButton>

              {resetRequested && (
                <button
                  type="button"
                  onClick={requestResetCode}
                  className="inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-[var(--theme-body-muted)]/90 underline sm:w-auto"
                  disabled={resetLoading}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  인증코드 다시 받기
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <TextInput
                id="identifier"
                label="학번 또는 이메일"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="학번 또는 이메일을 입력하세요"
                autoComplete="username"
              />

              <TextInput
                id="password"
                label="비밀번호"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
              />

              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--theme-body-muted)]/90">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 accent-[var(--theme-accent)]"
                />
                자동 로그인
              </label>

              {notice && <div className="text-sm text-emerald-700">{notice}</div>}
              {error && <div className="text-sm text-red-500">{error}</div>}

              <ActionButton icon={LogIn} loading={loading}>
                {loading ? '로그인 중...' : '로그인'}
              </ActionButton>

              <div className="flex flex-col gap-3 text-sm text-[var(--theme-body-muted)]/90 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={goSignup} className={linkButtonClass}>
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <UserPlus size={14} aria-hidden="true" />
                    회원가입
                  </span>
                </button>

                <button type="button" onClick={openResetStep} className={linkButtonClass}>
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <KeyRound size={14} aria-hidden="true" />
                    비밀번호 찾기
                  </span>
                </button>
              </div>

              <p className="mt-4 text-xs leading-5 text-[var(--theme-body-muted)]/80">
                학번이 기억나지 않는 졸업생은 가입 이메일로 로그인하거나 비밀번호를 재설정할 수 있습니다.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
