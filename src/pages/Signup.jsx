export default function Signup({ onBack }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <h2 className="mb-2 text-2xl font-bold">회원가입</h2>
      <p className="mb-4 text-sm text-gray-300">회원가입은 추후 백엔드 연동 시 진행됩니다.</p>

      <div className="space-y-3">
        <p className="text-sm text-gray-400">- 회원가입 폼은 준비 중입니다.</p>
        <p className="text-sm text-gray-400">- 백엔드 API가 준비되면 이 페이지에 연결됩니다.</p>

        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold"
        >
          로그인으로 돌아가기
        </button>
      </div>
    </section>
  )
}
