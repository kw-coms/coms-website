import { useEffect, useRef, useState } from 'react'
import { confirmSignupEmailVerification, requestSignupEmailVerification, signupUser } from '../services/authApi.js'

const INTEREST_OPTIONS = ['보안', '웹', '앱']
const RESEND_COOLDOWN_SECONDS = 60

function InterestsSelector({ selected, onChange, otherText, onOtherChange }) {
  const toggle = (option) => {
    const next = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option]
    onChange(next)
  }

  const hasOther = selected.includes('기타')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`shape-cut-sm px-4 py-2 text-sm font-semibold transition ${
              selected.includes(option)
                ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
            }`}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => toggle('기타')}
          className={`shape-cut-sm px-4 py-2 text-sm font-semibold transition ${
            hasOther
              ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
              : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
          }`}
        >
          기타
        </button>
      </div>
      {hasOther && (
        <input
          value={otherText}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="기타 관심 분야를 입력하세요"
          maxLength={100}
          className="w-full shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50"
        />
      )}
    </div>
  )
}

function VerifyStep({ studentId, email, onDone }) {
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
      await requestSignupEmailVerification(studentId)
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
      await confirmSignupEmailVerification(studentId, code.trim())
      onDone()
    } catch (err) {
      setError(err.message || '인증코드가 올바르지 않습니다.')
    } finally {
      setVerifying(false)
    }
  }

  const inputClass =
    'w-full shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  return (
    <div className="space-y-5">
      <div className="shape-cut-sm border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
        <p className="font-semibold">이메일로 인증코드를 발송했습니다.</p>
        <p className="mt-1 text-xs opacity-80">{email} 받은편지함을 확인해주세요. 10분 이내에 입력해야 합니다.</p>
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
          <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={verifying || code.length !== 6}
          className="shape-cut-sm w-full bg-white/70 px-4 py-3 text-base font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="font-semibold text-[var(--theme-body-dark)] underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending ? '전송 중...' : cooldown > 0 ? `재전송 (${cooldown}s)` : '코드 재전송'}
        </button>
      </div>
    </div>
  )
}

export default function Signup({ onBack }) {
  const [step, setStep] = useState('form')
  const [signedUpStudentId, setSignedUpStudentId] = useState('')
  const [signedUpEmail, setSignedUpEmail] = useState('')

  const [form, setForm] = useState({
    studentId: '',
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    department: '',
    phone: '',
    aspiration: '',
  })
  const [selectedInterests, setSelectedInterests] = useState([])
  const [otherInterest, setOtherInterest] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inputClass =
    'w-full shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  const labelClass = 'mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]'

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const validateForm = () => {
    if (!form.studentId.trim()) return '학번을 입력해주세요.'
    if (!/^\d{10}$/.test(form.studentId.trim())) return '학번은 숫자 10자리여야 합니다.'
    if (!form.name.trim()) return '이름을 입력해주세요.'
    if (!/^[가-힣]{3}$/.test(form.name.trim())) return '이름은 한글 3자리여야 합니다.'
    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (!form.password) return '비밀번호를 입력해주세요.'
    if (/\s/.test(form.password)) return '비밀번호에 공백을 사용할 수 없습니다.'
    if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(form.password)) return '비밀번호는 8자 이상, 영문·숫자·특수문자(!@#$ 등)를 모두 포함해야 합니다.'
    if (form.password !== form.passwordConfirm) return '비밀번호 확인이 일치하지 않습니다.'
    if (selectedInterests.includes('기타') && !otherInterest.trim()) return '기타 관심 분야를 입력해주세요.'
    return ''
  }

  const buildInterestsString = () => {
    if (selectedInterests.length === 0) return ''
    return selectedInterests
      .map((i) => (i === '기타' ? `기타:${otherInterest.trim()}` : i))
      .join(',')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setLoading(true)
    try {
      await signupUser({
        studentId: form.studentId.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department.trim(),
        phone: form.phone.trim(),
        aspiration: form.aspiration.trim() || null,
        interests: buildInterestsString() || null,
      })
      setSignedUpStudentId(form.studentId.trim())
      setSignedUpEmail(form.email.trim())
      setStep('verify')
    } catch (err) {
      setError(err.message || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle = step === 'verify' ? '이메일 인증' : step === 'done' ? '가입 완료' : '회원가입'
  const stepDesc = step === 'verify'
    ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.'
    : step === 'done'
    ? '이메일 인증이 완료되었습니다. 로그인하시면 됩니다.'
    : "COM's 명부에 등록된 정보와 일치해야 계정을 만들 수 있습니다."

  return (
    <main className="w-full min-h-screen px-5 pb-28 pt-6 text-[var(--theme-text)]">
      <section className="shape-cut mx-auto w-full max-w-[820px] bg-[var(--theme-surface-96)] p-6 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-3xl sm:p-7 lg:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">{stepTitle}</h1>
          <p className="mt-3 text-base text-[var(--theme-body-muted)]">{stepDesc}</p>
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="studentId">학번</label>
                <input id="studentId" name="studentId" value={form.studentId} onChange={handleChange} className={inputClass} placeholder="학번을 입력하세요" autoComplete="username" />
              </div>
              <div>
                <label className={labelClass} htmlFor="name">이름</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="email">이메일</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="이메일을 입력하세요" autoComplete="email" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="department">학과</label>
                <input id="department" name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="학과를 입력하세요" />
              </div>
              <div>
                <label className={labelClass} htmlFor="phone">전화번호</label>
                <input id="phone" name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="01012345678 (하이픈 없이)" autoComplete="tel" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="password">비밀번호</label>
                <input id="password" name="password" type="password" value={form.password} onChange={handleChange} className={inputClass} placeholder="영문+숫자+특수문자 8자 이상" autoComplete="new-password" />
              </div>
              <div>
                <label className={labelClass} htmlFor="passwordConfirm">비밀번호 확인</label>
                <input id="passwordConfirm" name="passwordConfirm" type="password" value={form.passwordConfirm} onChange={handleChange} className={inputClass} placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password" />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                관심 분야 <span className="font-normal text-[var(--theme-body-muted)]">(선택사항, 복수 선택 가능)</span>
              </label>
              <InterestsSelector
                selected={selectedInterests}
                onChange={setSelectedInterests}
                otherText={otherInterest}
                onOtherChange={setOtherInterest}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="aspiration">
                포부 <span className="font-normal text-[var(--theme-body-muted)]">(선택사항)</span>
              </label>
              <textarea
                id="aspiration"
                name="aspiration"
                value={form.aspiration}
                onChange={handleChange}
                rows={3}
                maxLength={500}
                placeholder="동아리에서 이루고 싶은 목표나 포부를 적어주세요."
                className="w-full shape-cut-sm resize-none border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50"
              />
            </div>

            {error && (
              <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="shape-cut-sm mt-1 w-full bg-white/70 px-4 py-3 text-base font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? '가입 처리 중...' : '회원가입'}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <VerifyStep
            studentId={signedUpStudentId}
            email={signedUpEmail}
            onDone={() => setStep('done')}
          />
        )}

        {step === 'done' && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
              ✓
            </div>
            <p className="text-base font-semibold text-emerald-700">이메일 인증이 완료되었습니다!</p>
            <button
              type="button"
              onClick={onBack}
              className="shape-cut-sm inline-block w-full bg-white/70 px-4 py-3 text-base font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/90"
            >
              로그인하러 가기
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
