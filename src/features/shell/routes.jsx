// Routes for the shell feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
// Importing ./auth installs Codi.openSignIn, ./github-api installs Codi.github, ./theme installs Codi.theme.
import { Navigate } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import './theme';
import { LoginPage, RegisterPage } from './auth';
import { ForgotPasswordPage, ResetPasswordPage } from './password-pages';
import { SettingsPage } from './settings-page';
import { ProfilePage } from './profile-page';
import './github-api';
import GithubOnboardingPage, { safeNext } from './github-onboarding-page';

const SIGNED_IN = ['learner', 'lecturer', 'admin'];

// The GitHub profile lives in the "Hồ sơ năng lực" tab of /profile; old links land there (real app/profile/github).
function GithubProfileRedirect({ query }) {
  const q = new URLSearchParams({ tab: 'nang-luc' });
  if (query && query.error) q.set('error', query.error);
  return <Navigate to={`/profile?${q.toString()}`} replace />;
}

const routes = [
  { path: '/login', element: LoginPage, title: 'Đăng nhập' },
  { path: '/register', element: RegisterPage, title: 'Tạo tài khoản' },
  { path: '/forgot-password', element: ForgotPasswordPage, title: 'Quên mật khẩu' },
  { path: '/reset-password', element: ResetPasswordPage, title: 'Đặt lại mật khẩu' },
  // Real settings has no app header: a close button (and Esc) returns to the role home.
  { path: '/settings', element: SettingsPage, title: 'Cài đặt', role: SIGNED_IN, layout: 'focus', exit: { href: () => Codi.homeFor(Codi.role()), label: 'Đóng cài đặt' } },
  { path: '/profile', element: ProfilePage, title: 'Hồ sơ cá nhân', role: SIGNED_IN },
  { path: '/profile/github', element: GithubProfileRedirect, title: 'Hồ sơ năng lực', role: SIGNED_IN },
  { path: '/github/analysis', element: GithubProfileRedirect, title: 'Hồ sơ năng lực', role: SIGNED_IN },
  // Optional account step after sign-up; also opened from the dashboard card and course onboarding (?next= returns there).
  { path: '/onboarding/github', element: GithubOnboardingPage, title: 'Kết nối GitHub', role: 'learner', layout: 'focus', exit: { href: () => safeNext(Codi.query().next), label: 'Để sau' } },
];

export default routes;
