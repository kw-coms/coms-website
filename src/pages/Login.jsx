import { useState } from 'react'

export default function Login({ onBack, goSignup }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const btnClass = 'rounded-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold transition w-full'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!identifier || !password) {
      setError('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      // TODO: 실제 로그인 API 연동 지점
      // 예: await api.post('/auth/login', { identifier, password })
      await new Promise((r) => setTimeout(r, 600))

      // 현재는 항상 실패 예시를 보여줍니다. 백엔드 연동 시 성공 처리로 교체하세요.
      setError('로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.')
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <div className="mb-6 flex items-center gap-4">
        <img src="/coms-logo.png" alt="KW COM's" className="h-10 w-10 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-snug">KW COM's 로그인</h2>
          <p className="text-sm text-gray-300 truncate">동아리 계정으로 로그인하세요.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-gray-300">아이디</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="아이디를 입력하세요"
            className="w-full rounded-full border border-white/10 bg-black/60 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-gray-300">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            className="w-full rounded-full border border-white/10 bg-black/60 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div>
          <button type="submit" className={btnClass} disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-300">
          <button type="button" onClick={goSignup} className="underline">
            회원가입
          </button>

          <button
            type="button"
            onClick={() => alert('비밀번호 분실 문의: coms@example.com')}
            className="underline"
          >
            비밀번호 찾기
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          로그인 정보가 기억나지 않거나 계정에 문제가 있는 경우 관리팀에 문의해주세요.
        </p>
      </form>
    </section>
  )
}
