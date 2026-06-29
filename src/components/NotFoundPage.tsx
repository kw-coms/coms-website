import { useNavigate } from 'react-router-dom'
import { getLogoAsset } from '../utils/logoAssets'
import { ghostActionBtnClass, solidActionBtnClass } from '../shared/homeUi'
import { scrollToTopInstant } from '../utils/themeColors'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="apple-detail-page theme-home relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--app-surface-soft)] px-6 text-center text-[var(--app-text)]">
      <div className="home-hero-surface absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center">
        <img src={getLogoAsset('COMs_logo_vec')} alt="" className="coms-cinema-intrologo mb-8 w-20 sm:w-24" aria-hidden="true" />
        <p className="apple-display coms-3d-title coms-cinema-title text-7xl sm:text-8xl">404</p>
        <h1 className="mt-6 text-2xl font-bold text-[var(--app-text)] sm:text-3xl">페이지를 찾을 수 없어요</h1>
        <p className="apple-copy mt-3 max-w-md text-base text-[var(--app-muted)]">
          주소가 바뀌었거나 사라진 페이지일 수 있어요. 홈으로 돌아가 다시 찾아보세요.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => { scrollToTopInstant(); navigate('/') }} className={solidActionBtnClass}>홈으로</button>
          <button type="button" onClick={() => navigate(-1)} className={ghostActionBtnClass}>이전으로</button>
        </div>
      </div>
    </div>
  )
}
