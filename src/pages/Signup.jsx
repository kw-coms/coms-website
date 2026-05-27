import { useState } from 'react'
import { signupUser } from '../services/authApi.js'

export default function Signup() {
  const [form, setForm] = useState({
    studentId: '',
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    department: '',
    phone: '',
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const inputClass =
    'w-full shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  const labelClass =
    'mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]'

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const validateForm = () => {
    if (!form.studentId.trim()) return '학번을 입력해주세요.'
    if (!form.name.trim()) return '이름을 입력해주세요.'
    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (!form.password) return '비밀번호를 입력해주세요.'
    if (form.password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
    if (form.password !== form.passwordConfirm) {
      return '비밀번호 확인이 일치하지 않습니다.'
    }

    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

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
      })

      setSuccess('회원가입 신청이 완료되었습니다.')

      setForm({
        studentId: '',
        name: '',
        email: '',
        password: '',
        passwordConfirm: '',
        department: '',
        phone: '',
      })
    } catch (err) {
      setError(err.message || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="w-full min-h-screen px-5 pb-28 pt-6 text-[var(--theme-text)]">
      <section className="shape-cut mx-auto w-full max-w-[820px] bg-[var(--theme-surface-96)] p-6 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-3xl sm:p-7 lg:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">회원가입</h1>
          <p className="mt-3 text-base text-[var(--theme-body-muted)]">
            COM&apos;s 동아리 계정 생성을 위해 정보를 입력해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="studentId">
                학번
              </label>
              <input
                id="studentId"
                name="studentId"
                value={form.studentId}
                onChange={handleChange}
                className={inputClass}
                placeholder="학번을 입력하세요"
                autoComplete="username"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="name">
                이름
              </label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                className={inputClass}
                placeholder="이름을 입력하세요"
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="email">
              이메일
            </label>
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="department">
                학과
              </label>
              <input
                id="department"
                name="department"
                value={form.department}
                onChange={handleChange}
                className={inputClass}
                placeholder="학과를 입력하세요"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="phone">
                전화번호
              </label>
              <input
                id="phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className={inputClass}
                placeholder="전화번호를 입력하세요"
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className={inputClass}
                placeholder="8자 이상 입력하세요"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="passwordConfirm">
                비밀번호 확인
              </label>
              <input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                value={form.passwordConfirm}
                onChange={handleChange}
                className={inputClass}
                placeholder="비밀번호를 다시 입력하세요"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="shape-cut-sm bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="shape-cut-sm mt-1 w-full bg-white/70 px-4 py-3 text-base font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '가입 처리 중...' : '회원가입 신청'}
          </button>
        </form>
      </section>
    </main>
  )
}