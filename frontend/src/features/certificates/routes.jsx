// Routes for certificates: public verification, no sign-in.
// Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
import './certificates.css';
import VerifyPage from './verify-page';

const routes = [
  { path: '/verify', element: VerifyPage, title: 'Xác minh chứng chỉ' },
  { path: '/verify/:code', element: VerifyPage, title: 'Xác minh chứng chỉ' },
];

export default routes;
