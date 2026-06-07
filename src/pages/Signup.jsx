import { useState } from 'react'
import { signupUser } from '../services/authApi.js'
import { EmailVerifyStep } from '../components/EmailVerifyStep.jsx'

const CURRENT_SIGNUP = 'current'
const GRADUATE_SIGNUP = 'graduate'
const OTHER_INTEREST = '기타'
const FIRST_GENERATION_YEAR = 1966

const INTEREST_OPTIONS = ['보안', '웹', '앱']
const SIGNUP_TYPES = [
  { id: CURRENT_SIGNUP, label: '재학생' },
  { id: GRADUATE_SIGNUP, label: '졸업생' },
]

const STUDENT_ID_PATTERN = /^\d{10}$/
const NAME_PATTERN = /^[가-힣]{3}$/
const TWO_DIGIT_PATTERN = /^\d{2}$/
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/

const inputClass =
  'w-full min-h-12 min-w-0 shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-base text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'
const textareaClass =
  'w-full min-w-0 shape-cut-sm resize-none border border-black/10 bg-white/70 px-4 py-3 text-base text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]'
const fieldGridClass = 'grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2'

function choiceButtonClass(active) {
  return `shape-cut-sm min-h-11 px-4 py-2 text-sm font-semibold transition ${
    active
      ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
      : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
  }`
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        className={inputClass}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </div>
  )
}

function SignupTypeSelector({ value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="가입 구분">
      {SIGNUP_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          onClick={() => onChange(type.id)}
          aria-pressed={value === type.id}
          className={`shape-cut-sm min-h-12 px-4 py-3 text-sm font-semibold transition ${
            value === type.id
              ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
              : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}

function InterestsSelector({ selected, onChange, otherText, onOtherChange }) {
  const toggle = (option) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option]
    onChange(next)
  }

  const hasOther = selected.includes(OTHER_INTEREST)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap">
        {[...INTEREST_OPTIONS, OTHER_INTEREST].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={choiceButtonClass(selected.includes(option))}
          >
            {option}
          </button>
        ))}
      </div>
      {hasOther && (
        <input
          value={otherText}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder="기타 관심 분야를 입력하세요"
          maxLength={100}
          className={inputClass}
        />
      )}
    </div>
  )
}

const initialForm = {
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
}

function admissionYearFromStudentId(studentId) {
  const trimmed = studentId.trim()
  return /^\d{4}/.test(trimmed) ? Number(trimmed.slice(0, 4)) : null
}

function normalizeGraduateValue(value) {
  return value.trim().replace(/[^0-9]/g, '')
}

export default function Signup({ onBack }) {
  const [step, setStep] = useState('form')
  const [signupType, setSignupType] = useState(CURRENT_SIGNUP)
  const [signedUpStudentId, setSignedUpStudentId] = useState('')
  const [signedUpEmail, setSignedUpEmail] = useState('')
  const [form, setForm] = useState(initialForm)
  const [selectedInterests, setSelectedInterests] = useState([])
  const [otherInterest, setOtherInterest] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const admissionYear = admissionYearFromStudentId(form.studentId)
  const graduateCutoffYear = new Date().getFullYear() - 7
  const isGraduateSignup = signupType === GRADUATE_SIGNUP
  const isCurrentSignup = signupType === CURRENT_SIGNUP
  const isGraduateStudentId = admissionYear !== null && admissionYear <= graduateCutoffYear

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSignupTypeChange = (nextType) => {
    setSignupType(nextType)
    setError('')
  }

  const buildInterestsString = () => {
    if (selectedInterests.length === 0) return ''
    return selectedInterests
      .map((item) => (item === OTHER_INTEREST ? `${OTHER_INTEREST}:${otherInterest.trim()}` : item))
      .join(',')
  }

  const validateForm = () => {
    const studentId = form.studentId.trim()
    const name = form.name.trim()
    const graduateValue = normalizeGraduateValue(form.graduateVerificationValue)

    if (!studentId) return '학번을 입력해주세요.'
    if (!STUDENT_ID_PATTERN.test(studentId)) return '학번은 숫자 10자리여야 합니다.'
    if (!name) return '이름을 입력해주세요.'
    if (!NAME_PATTERN.test(name)) return '이름은 한글 3자리여야 합니다.'
    if (isGraduateSignup && !isGraduateStudentId) return `졸업생은 ${graduateCutoffYear}학번 이전 학번으로 가입해주세요.`
    if (isCurrentSignup && isGraduateStudentId) return '졸업생은 졸업생 회원가입을 선택해주세요.'

    if (isGraduateSignup) {
      if (!graduateValue) return '졸업생 인증 정보를 입력해주세요.'
      if (form.graduateVerificationType === 'YEAR') {
        const expectedYear = String(admissionYear).slice(-2)
        if (!TWO_DIGIT_PATTERN.test(graduateValue) || graduateValue !== expectedYear) {
          return '학번 연도 두 자리는 입학연도 끝 두 자리와 같아야 합니다.'
        }
      } else {
        const expectedGeneration = String(admissionYear - FIRST_GENERATION_YEAR)
        if (graduateValue !== expectedGeneration) return '기수가 학번의 입학연도와 일치하지 않습니다.'
      }
    }

    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (!form.password) return '비밀번호를 입력해주세요.'
    if (/\s/.test(form.password)) return '비밀번호에 공백을 사용할 수 없습니다.'
    if (!PASSWORD_PATTERN.test(form.password)) return '비밀번호는 8자 이상, 영문·숫자·특수문자(!@#$ 등)를 모두 포함해야 합니다.'
    if (form.password !== form.passwordConfirm) return '비밀번호 확인이 일치하지 않습니다.'

    if (isCurrentSignup && selectedInterests.length === 0) return '재학생 관심 분야를 하나 이상 선택해주세요.'
    if (isCurrentSignup && selectedInterests.includes(OTHER_INTEREST) && !otherInterest.trim()) return '기타 관심 분야를 입력해주세요.'
    if (isCurrentSignup && !form.aspiration.trim()) return '재학생 포부를 입력해주세요.'
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

    const studentId = form.studentId.trim()
    const email = form.email.trim()

    setLoading(true)
    try {
      await signupUser({
        signupType: isGraduateSignup ? 'GRADUATE' : 'CURRENT',
        studentId,
        name: form.name.trim(),
        graduateVerificationType: isGraduateSignup ? form.graduateVerificationType : null,
        graduateVerificationValue: isGraduateSignup ? form.graduateVerificationValue.trim() : null,
        email,
        password: form.password,
        department: form.department.trim(),
        phone: form.phone.trim(),
        aspiration: isCurrentSignup ? form.aspiration.trim() : null,
        interests: isCurrentSignup ? buildInterestsString() : null,
      })
      setSignedUpStudentId(studentId)
      setSignedUpEmail(email)
      setStep('verify')
    } catch (err) {
      setError(err.message || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle = step === 'verify' ? '이메일 인증' : step === 'done' ? '가입 완료' : isGraduateSignup ? '졸업생 회원가입' : '회원가입'
  const stepDesc = step === 'verify'
    ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.'
    : step === 'done'
      ? '이메일 인증이 완료되었습니다. 로그인하시면 됩니다.'
      : isGraduateSignup
        ? '졸업생 명부 인증 정보와 일치해야 계정을 만들 수 있습니다.'
        : "COM's 명부 확인 후 관심 분야와 포부를 함께 등록합니다."

  return (
    <main className="w-full px-0 pb-6 pt-0 text-[var(--theme-text)] sm:pb-8">
      <section className="shape-cut mx-auto grid w-full max-w-[1120px] gap-5 bg-[var(--theme-surface-96)] p-4 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-3xl sm:p-7 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-9 lg:p-8">
        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--theme-body-muted)]/80">Signup</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{stepTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--theme-body-muted)] sm:text-base sm:leading-7">{stepDesc}</p>
        </div>

        <div className="min-w-0">
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="grid min-w-0 gap-4 sm:gap-5">
              <SignupTypeSelector value={signupType} onChange={handleSignupTypeChange} />

              <div className={fieldGridClass}>
                <TextField
                  id="studentId"
                  label={isGraduateSignup ? '졸업 당시 학번' : '학번'}
                  value={form.studentId}
                  onChange={handleChange}
                  placeholder={isGraduateSignup ? '졸업 당시 학번 10자리' : '학번을 입력하세요'}
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="username"
                />
                <TextField
                  id="name"
                  label="이름"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="이름을 입력하세요"
                  autoComplete="name"
                />
              </div>

              {isGraduateSignup && (
                <div className="shape-cut-sm grid min-w-0 gap-3 border border-cyan-300/20 bg-cyan-300/8 p-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass} htmlFor="graduateVerificationType">졸업생 인증 방식</label>
                    <select
                      id="graduateVerificationType"
                      name="graduateVerificationType"
                      value={form.graduateVerificationType}
                      onChange={handleChange}
                      className={inputClass}
                    >
                      <option value="YEAR">학번 연도 두 자리</option>
                      <option value="GENERATION">기수</option>
                    </select>
                  </div>
                  <TextField
                    id="graduateVerificationValue"
                    label={form.graduateVerificationType === 'YEAR' ? '입학연도 끝 두 자리' : '기수'}
                    value={form.graduateVerificationValue}
                    onChange={handleChange}
                    placeholder={form.graduateVerificationType === 'YEAR' ? '예: 19' : '예: 53기'}
                    inputMode="numeric"
                  />
                  <p className="text-sm leading-6 text-[var(--theme-body-muted)] sm:col-span-2">
                    {graduateCutoffYear}학번 이전 졸업생은 명부의 이름과 학번 연도 두 자리(예: 19학번의 19) 또는 기수로 인증합니다.
                  </p>
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="email">이메일</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                />
              </div>

              <div className={fieldGridClass}>
                <TextField id="department" label="학과" value={form.department} onChange={handleChange} placeholder="학과를 입력하세요" />
                <TextField id="phone" label="전화번호" value={form.phone} onChange={handleChange} placeholder="01012345678 (하이픈 없이)" inputMode="tel" autoComplete="tel" />
              </div>

              <div className={fieldGridClass}>
                <TextField id="password" label="비밀번호" type="password" value={form.password} onChange={handleChange} placeholder="영문+숫자+특수문자 8자 이상" autoComplete="new-password" />
                <TextField id="passwordConfirm" label="비밀번호 확인" type="password" value={form.passwordConfirm} onChange={handleChange} placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password" />
              </div>

              {isCurrentSignup && (
                <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass}>
                      관심 분야 <span className="font-normal text-[var(--theme-body-muted)]">(복수 선택 가능)</span>
                    </label>
                    <InterestsSelector
                      selected={selectedInterests}
                      onChange={setSelectedInterests}
                      otherText={otherInterest}
                      onOtherChange={setOtherInterest}
                    />
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="aspiration">포부</label>
                    <textarea
                      id="aspiration"
                      name="aspiration"
                      value={form.aspiration}
                      onChange={handleChange}
                      rows={3}
                      maxLength={500}
                      placeholder="동아리에서 이루고 싶은 목표나 포부를 적어주세요."
                      className={textareaClass}
                    />
                  </div>
                </div>
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
        </div>
      </section>
    </main>
  )
}
