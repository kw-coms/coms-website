import { lazy } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { scrollToTopInstant } from '../utils/themeColors'

const Archive = lazy(() => import('../pages/Archive'))
const Login = lazy(() => import('../pages/Login'))
const Signup = lazy(() => import('../pages/Signup'))
const Notices = lazy(() => import('../pages/Notices'))
const Admin = lazy(() => import('../pages/Admin'))
const Community = lazy(() => import('../pages/Community'))
const CommunityBookmarks = lazy(() => import('../pages/community/CommunityBookmarks'))
const CommunityMemberProfile = lazy(() => import('../pages/community/CommunityMemberProfile'))
const ChangePassword = lazy(() => import('../pages/ChangePassword'))
const RecruitApply = lazy(() => import('../pages/RecruitApply'))
const RecruitNotice = lazy(() => import('../pages/RecruitNotice'))

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromLocation = location.state?.from
  const successPath = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : '/'
  return (
    <PageShell>
      <Login
        onCancel={() => navigate('/', { replace: true })}
        onSuccess={() => navigate(successPath, { replace: true })}
        goSignup={() => navigate('/signup')}
      />
    </PageShell>
  )
}

export function SignupPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Signup onBack={() => navigate('/login')} />
    </PageShell>
  )
}

export function NoticesPage() {
  return (
    <PageShell wide full>
      <Notices />
    </PageShell>
  )
}

export function ArchivePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Archive onBack={() => navigate('/')} />
    </PageShell>
  )
}

export function CommunityPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Community onBack={() => navigate('/')} />
    </PageShell>
  )
}

export function CommunityBookmarksPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <CommunityBookmarks onBack={() => navigate('/community')} />
    </PageShell>
  )
}

export function CommunityMemberProfilePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <CommunityMemberProfile onBack={() => navigate('/community')} />
    </PageShell>
  )
}

export function AdminPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <Admin onBack={() => navigate('/')} />
    </PageShell>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <ChangePassword onBack={() => navigate('/')} />
    </PageShell>
  )
}

export function RecruitPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full transition={false}>
      <RecruitApply onBack={() => navigate('/')} />
    </PageShell>
  )
}

export function RecruitNoticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const goApply = () => {
    scrollToTopInstant()
    navigate('/recruit')
  }

  return (
    <PageShell wide full transition={false}>
      <RecruitNotice onBack={() => navigate(from, { replace: true })} onApply={goApply} />
    </PageShell>
  )
}
