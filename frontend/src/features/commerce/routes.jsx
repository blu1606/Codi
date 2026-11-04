// Routes for the commerce feature (mockup learner-commerce.js + ai-advisor.js).
// Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
import './commerce.css';
import HomePage from './home-page';
import CatalogPage from './catalog-page';
import CourseDetailPage from './course-detail-page';
import CartPage from './cart-page';
import { CheckoutPage, CheckoutSuccessPage } from './checkout-page';
import AiAdvisorPage from './ai-advisor-page';

const routes = [
  { path: '/', element: HomePage, title: 'Trang chủ' },
  { path: '/courses', element: CatalogPage, title: 'Khoá học' },
  { path: '/courses/:slug', element: CourseDetailPage, title: 'Chi tiết khoá học' },
  { path: '/cart', element: CartPage, title: 'Giỏ hàng', role: 'learner' },
  { path: '/checkout', element: CheckoutPage, title: 'Thanh toán', role: 'learner', layout: 'focus', exit: { href: '/cart', label: 'Về giỏ hàng' } },
  { path: '/checkout/success', element: CheckoutSuccessPage, title: 'Thanh toán thành công', role: 'learner' },
  { path: '/ai', element: AiAdvisorPage, title: 'Tư vấn khoá học cùng AI', layout: 'default' },
];

export default routes;
