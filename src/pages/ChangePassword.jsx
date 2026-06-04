import { useState } from 'react'
import { changePassword } from '../services/authApi.js'
import { getLogoAsset } from '../utils/logoAssets.js'

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])(?!.*\s).{8,}$/

export default function ChangePassword({ onBack }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const panelClass = 'shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8'
  const frameClass = 'shape-cut-sm bg-black/12 p-px'
  const inputClass = 'w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 transition focus:bg-white/82 focus:ring-2 focus:ring-[var(--theme-accent)]/55'
  const btnClass = 'w-full shape-cut-sm bg-white/66 px-4 py-2.5 font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/82'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      alert('비밀번호가 변경되었습니다.')
      onBack()
    } catch (err) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.')
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
          돌아가기
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className={panelClass}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="h-10 w-10 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug sm:text-xl">비밀번호 변경</h2>
              <p className="text-sm leading-5 text-[var(--theme-body-muted)]/85">현재 비밀번호를 확인 후 새 비밀번호로 변경합니다.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">현재 비밀번호</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">새 비밀번호</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8자 이상, 영문·숫자·특수문자 포함"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">새 비밀번호 확인</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  className={inputClass}
                />
              </div>
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div>
              <div className={frameClass}>
                <button type="submit" className={btnClass} disabled={loading}>
                  {loading ? '변경 중...' : '비밀번호 변경'}
                </button>
              </div>
            </div>

            <p className="mt-2 text-xs leading-5 text-[var(--theme-body-muted)]/80">
              비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 하며 공백은 사용할 수 없습니다.
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
