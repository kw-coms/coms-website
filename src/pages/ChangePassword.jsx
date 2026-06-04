import { useState } from 'react'
import {
  changePassword,
  confirmEmailVerification,
  requestEmailVerification,
  updateProfile,
} from '../services/authApi.js'
import { useAuth } from '../contexts/useAuth.js'
import { getLogoAsset } from '../utils/logoAssets.js'

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])(?!.*\s).{8,}$/

export default function ChangePassword({ onBack }) {
  const { user, refreshUser, setUser } = useAuth()
  const [profileDraft, setProfileDraft] = useState({})
  const [verificationCode, setVerificationCode] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingAction, setLoadingAction] = useState('')

  const profileForm = {
    phone: profileDraft.phone ?? user?.phone ?? '',
    aspiration: profileDraft.aspiration ?? user?.aspiration ?? '',
    interests: profileDraft.interests ?? user?.interests ?? '',
  }

  const panelClass = 'shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8'
  const frameClass = 'shape-cut-sm bg-black/12 p-px'
  const inputClass = 'w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 transition focus:bg-white/82 focus:ring-2 focus:ring-[var(--theme-accent)]/55'
  const textareaClass = `${inputClass} min-h-28 resize-y leading-6`
  const btnClass = 'shape-cut-sm bg-white/66 px-4 py-2.5 font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/82 disabled:cursor-wait disabled:opacity-60'
  const sectionClass = 'border-t border-[var(--theme-border-soft)] pt-5'

  const resetMessages = () => {
    setError('')
    setProfileMessage('')
    setEmailMessage('')
    setPasswordMessage('')
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    resetMessages()
    setLoadingAction('profile')

    try {
      const updated = await updateProfile({
        phone: profileForm.phone.trim() || null,
        aspiration: profileForm.aspiration.trim() || null,
        interests: profileForm.interests.trim() || null,
      })
      setUser(updated)
      setProfileDraft({})
      setProfileMessage('회원 정보가 저장되었습니다.')
    } catch (err) {
      setError(err.message || '회원 정보 저장 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handleRequestEmailCode = async () => {
    resetMessages()
    setLoadingAction('emailRequest')

    try {
      const result = await requestEmailVerification()
      setEmailMessage(result.message || '인증코드를 이메일로 보냈습니다.')
      await refreshUser()
    } catch (err) {
      setError(err.message || '이메일 인증코드 요청 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handleConfirmEmailCode = async (e) => {
    e.preventDefault()
    resetMessages()

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('인증코드는 숫자 6자리로 입력해주세요.')
      return
    }

    setLoadingAction('emailConfirm')
    try {
      const result = await confirmEmailVerification(verificationCode.trim())
      setEmailMessage(result.message || '이메일 인증이 완료되었습니다.')
      setVerificationCode('')
      await refreshUser()
    } catch (err) {
      setError(err.message || '이메일 인증 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    resetMessages()

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setLoadingAction('password')
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage('비밀번호가 변경되었습니다.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
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
              <h2 className="text-lg font-bold leading-snug sm:text-xl">계정 설정</h2>
              <p className="text-sm leading-5 text-[var(--theme-body-muted)]/85">회원 정보, 이메일 인증, 비밀번호를 관리합니다.</p>
            </div>
          </div>

          {error && <div className="mb-4 text-sm text-red-500">{error}</div>}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">이름</label>
                <div className={frameClass}>
                  <input value={user?.name || ''} className={inputClass} disabled />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">학번</label>
                <div className={frameClass}>
                  <input value={user?.studentId || ''} className={inputClass} disabled />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">전화번호</label>
              <div className={frameClass}>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="01012345678"
                  autoComplete="tel"
                  maxLength={20}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">관심 분야</label>
              <div className={frameClass}>
                <input
                  value={profileForm.interests}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, interests: e.target.value }))}
                  placeholder="웹, AI, 알고리즘"
                  maxLength={500}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">포부</label>
              <div className={frameClass}>
                <textarea
                  value={profileForm.aspiration}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, aspiration: e.target.value }))}
                  placeholder="COM's에서 해보고 싶은 활동이나 목표를 적어주세요"
                  maxLength={2000}
                  className={textareaClass}
                />
              </div>
            </div>

            {profileMessage && <div className="text-sm text-emerald-600">{profileMessage}</div>}

            <button type="submit" className={btnClass} disabled={loadingAction === 'profile'}>
              {loadingAction === 'profile' ? '저장 중...' : '회원 정보 저장'}
            </button>
          </form>

          <div className={sectionClass}>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">이메일 인증</h3>
                <p className="text-sm text-[var(--theme-body-muted)]/85">{user?.email || '-'}</p>
              </div>
              <span className={`shape-cut-sm px-3 py-1 text-xs font-semibold ${user?.emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {user?.emailVerified ? '인증 완료' : '미인증'}
              </span>
            </div>

            {!user?.emailVerified && (
              <form onSubmit={handleConfirmEmailCode} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div className={frameClass}>
                  <input
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6자리 인증코드"
                    inputMode="numeric"
                    maxLength={6}
                    className={inputClass}
                  />
                </div>
                <button type="button" onClick={handleRequestEmailCode} className={btnClass} disabled={loadingAction === 'emailRequest'}>
                  {loadingAction === 'emailRequest' ? '발송 중...' : '코드 받기'}
                </button>
                <button type="submit" className={btnClass} disabled={loadingAction === 'emailConfirm'}>
                  {loadingAction === 'emailConfirm' ? '확인 중...' : '인증 확인'}
                </button>
              </form>
            )}

            {emailMessage && <div className="mt-3 text-sm text-emerald-600">{emailMessage}</div>}
          </div>

          <form onSubmit={handlePasswordSubmit} className={`${sectionClass} space-y-4`}>
            <h3 className="font-semibold">비밀번호 변경</h3>
            <div>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">현재 비밀번호</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">새 비밀번호</label>
                <div className={frameClass}>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8자 이상, 영문·숫자·특수문자 포함"
                    autoComplete="new-password"
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
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {passwordMessage && <div className="text-sm text-emerald-600">{passwordMessage}</div>}

            <button type="submit" className={btnClass} disabled={loadingAction === 'password'}>
              {loadingAction === 'password' ? '변경 중...' : '비밀번호 변경'}
            </button>

            <p className="text-xs leading-5 text-[var(--theme-body-muted)]/80">
              비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 하며 공백은 사용할 수 없습니다.
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
