// Routes for the admin feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
import { DashboardPage } from './admin-dashboard';
import { PublicationPage } from './admin-publication';
import { CoursesPage } from './admin-courses';
import { UsersPage } from './admin-users';
import { OrdersPage } from './admin-orders';
import { VouchersPage } from './admin-vouchers';
import { CertificatesPage } from './admin-certificates';
import { InsightsPage, InsightsDetailPage, FinancePage, FinanceDetailPage } from './admin-analytics';

const routes = [
  { path: '/admin', element: DashboardPage, title: 'Quản trị', role: 'admin' },
  { path: '/admin/publication', element: PublicationPage, title: 'Duyệt xuất bản', role: 'admin' },
  { path: '/admin/courses', element: CoursesPage, title: 'Khoá học đã xuất bản', role: 'admin' },
  { path: '/admin/users', element: UsersPage, title: 'Người dùng', role: 'admin' },
  { path: '/admin/orders', element: OrdersPage, title: 'Đơn hàng & giao dịch', role: 'admin' },
  { path: '/admin/vouchers', element: VouchersPage, title: 'Voucher', role: 'admin' },
  { path: '/admin/certificates', element: CertificatesPage, title: 'Chứng chỉ', role: 'admin' },
  { path: '/admin/insights', element: InsightsPage, title: 'Quan sát hệ thống', role: 'admin' },
  { path: '/admin/insights/:card', element: InsightsDetailPage, title: 'Quan sát hệ thống', role: 'admin' },
  { path: '/admin/finance', element: FinancePage, title: 'Tài chính', role: 'admin' },
  { path: '/admin/finance/:card', element: FinanceDetailPage, title: 'Tài chính', role: 'admin' },
];

export default routes;
