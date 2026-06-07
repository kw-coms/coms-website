import { useState } from 'react'
import { signupUser } from '../services/authApi.js'
import { EmailVerifyStep } from '../components/EmailVerifyStep.jsx'

const INTEREST_OPTIONS = ['보안', '웹', '앱']
const NAME_PATTERN = /^[가-힣]{3}$/
const STUDENT_ID_PATTERN = /^\d{10}$/

const inputClass =
  'w-full min-h-12 min-w-0 shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-base text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]'

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
      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap">
        {[...INTEREST_OPTIONS, '기타'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`shape-cut-sm min-h-11 px-4 py-2 text-sm font-semibold transition ${
              selected.includes(option)
                ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {hasOther && (
        <input
          value={otherText}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="기타 관심 분야를 입력하세요"
          maxLength={100}
          className={inputClass}
        />
      )}
    </div>
  )
}

export default function Signup({ onBack }) {
  const [step, setStep] = useState('form')
  const [signupType, setSignupType] = useState('current')
  const [signedUpStudentId, setSignedUpStudentId] = useState('')
  const [signedUpEmail, setSignedUpEmail] = useState('')

  const [form, setForm] = useState({
    studentId: '',
    name: '',
    graduateVerificationType: 'YEAR',
    graduateVerificationValue: '',
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

  const isGraduateSignup = signupType === 'graduate'
  const admissionYear = /^\d{4}/.test(form.studentId.trim())
    ? Number(form.studentId.trim().slice(0, 4))
    : null
  const graduateCutoffYear = new Date().getFullYear() - 7
  const isGraduateStudentId = admissionYear !== null && admissionYear <= graduateCutoffYear

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const buildInterestsString = () => {
    if (selectedInterests.length === 0) return ''
    return selectedInterests
      .map((i) => (i === '기타' ? `기타:${otherInterest.trim()}` : i))
      .join(',')
  }

  const validateForm = () => {
    const name = form.name.trim()

    if (isGraduateSignup) {
      if (!name) return '이름을 입력해주세요.'
      if (!NAME_PATTERN.test(name)) return '이름은 한글 3자리여야 합니다.'
      const verValue = form.graduateVerificationValue.trim().replace(/[^0-9]/g, '')
      if (!verValue) return '졸업생 인증 정보를 입력해주세요.'
      if (form.graduateVerificationType === 'YEAR' && !/^\d{2}$/.test(verValue)) {
        return '입학년도 끝 두자리(숫자 2자리)를 입력해주세요.'
      }
      if (form.graduateVerificationType === 'GENERATION' && (!/^\d+$/.test(verValue) || parseInt(verValue, 10) < 1)) {
        return '기수를 올바르게 입력해주세요.'
      }
    } else {
      const studentId = form.studentId.trim()
      if (!studentId) return '학번을 입력해주세요.'
      if (!STUDENT_ID_PATTERN.test(studentId)) return '학번은 숫자 10자리여야 합니다.'
      if (!name) return '이름을 입력해주세요.'
      if (!NAME_PATTERN.test(name)) return '이름은 한글 3자리여야 합니다.'
      if (isGraduateStudentId) return '졸업생은 졸업생 회원가입을 선택해주세요.'
    }

    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (!form.password) return '비밀번호를 입력해주세요.'
    if (/\s/.test(form.password)) return '비밀번호에 공백을 사용할 수 없습니다.'
    if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(form.password)) {
      return '비밀번호는 8자 이상, 영문·숫자·특수문자(!@#$ 등)를 모두 포함해야 합니다.'
    }
    if (form.password !== form.passwordConfirm) return '비밀번호 확인이 일치하지 않습니다.'
    if (!isGraduateSignup && selectedInterests.includes('기타') && !otherInterest.trim()) {
      return '기타 관심 분야를 입력해주세요.'
    }
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    const email = form.email.trim()
    setLoading(true)
    try {
      if (isGraduateSignup) {
        await signupUser({
          signupType: 'GRADUATE',
          name: form.name.trim(),
          graduateVerificationType: form.graduateVerificationType,
          graduateVerificationValue: form.graduateVerificationValue.trim().replace(/[^0-9]/g, ''),
          email,
          password: form.password,
          department: form.department.trim(),
          phone: form.phone.trim(),
        })
        setSignedUpStudentId('')
      } else {
        const studentId = form.studentId.trim()
        await signupUser({
          signupType: 'CURRENT',
          studentId,
          name: form.name.trim(),
          email,
          password: form.password,
          department: form.department.trim(),
          phone: form.phone.trim(),
          aspiration: form.aspiration.trim() || null,
          interests: buildInterestsString() || null,
        })
        setSignedUpStudentId(studentId)
      }
      setSignedUpEmail(email)
      setStep('verify')
    } catch (err) {
      setError(err.message || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle =
    step === 'verify' ? '이메일 인증'
    : step === 'done' ? '가입 완료'
    : isGraduateSignup ? '졸업생 회원가입'
    : '회원가입'
  const stepDesc =
    step === 'verify'
      ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.'
      : step === 'done'
      ? '이메일 인증이 완료되었습니다. 로그인하시면 됩니다.'
      : isGraduateSignup
      ? '졸업생 명부 인증 정보와 이름이 일치해야 계정을 만들 수 있습니다.'
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
            <div className="grid gap-2 sm:grid-cols-2">
              {[{ id: 'current', label: '재학생' }, { id: 'graduate', label: '졸업생' }].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setSignupType(t.id); setError('') }}
                  className={`shape-cut-sm min-h-12 px-4 py-3 text-sm font-semibold transition ${
                    signupType === t.id
                      ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                      : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {!isGraduateSignup ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="studentId">학번</label>
                  <input
                    id="studentId"
                    name="studentId"
                    value={form.studentId}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="학번을 입력하세요"
                    autoComplete="username"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="name">이름</label>
                  <input id="name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" />
                </div>
              </div>
            ) : (
              <div>
                <label className={labelClass} htmlFor="name">이름</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" />
              </div>
            )}

            {isGraduateSignup && (
              <div className="shape-cut-sm grid gap-3 border border-cyan-300/20 bg-cyan-300/8 p-4 md:grid-cols-[180px_1fr]">
                <div>
                  <label className={labelClass} htmlFor="graduateVerificationType">졸업생 인증 방식</label>
                  <select
                    id="graduateVerificationType"
                    name="graduateVerificationType"
                    value={form.graduateVerificationType}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="YEAR">입학년도 끝 두자리</option>
                    <option value="GENERATION">기수</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="graduateVerificationValue">
                    {form.graduateVerificationType === 'YEAR' ? '입학년도 끝 두자리' : '기수'}
                  </label>
                  <input
                    id="graduateVerificationValue"
                    name="graduateVerificationValue"
                    value={form.graduateVerificationValue}
                    onChange={handleChange}
                    className={inputClass}
                    inputMode="numeric"
                    placeholder={form.graduateVerificationType === 'YEAR' ? '예: 19' : '예: 53기'}
                  />
                </div>
                <p className="text-sm leading-6 text-[var(--theme-body-muted)] md:col-span-2">
                  {graduateCutoffYear}년 이전 입학 졸업생은 명부의 이름과 입학년도 끝 두자리(예: 19) 또는 기수로 인증합니다.
                </p>
              </div>
            )}

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

            {!isGraduateSignup && (
              <>
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
              </>
            )}

            {error && (
              <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="shape-cut-sm mt-1 min-h-12 w-full bg-white/70 px-4 py-3 text-base font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? '가입 처리 중...' : isGraduateSignup ? '졸업생 회원가입' : '회원가입'}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <EmailVerifyStep
            studentId={signedUpStudentId || null}
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
