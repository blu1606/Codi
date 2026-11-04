/**
 * Role navigation for the app header, the mobile drawer and the global search.
 *
 *  primaryNav(role, adminCounts) → header items { href, label, icon, match, count?, countLabel? }. Lecturer counts
 *                      come from the lecturer workspace cache (counts()); admin counts from useAdminNavCounts()
 *                      (pending publication requests, orders flagged for reconciliation).
 *  accountLinks(role)→ account menu items { href, label, icon }.
 *  pagesFor(role)    → searchable pages { href, title, subtitle, icon, keywords }.
 *  normalize(text)   → Vietnamese-insensitive form: NFD, combining marks removed, đ→d, lower case.
 */
import { Codi } from '../../lib/codi';
import { counts as teachCounts } from '../lecturer/teach-api';

const MARKS = /[̀-ͯ]/g;
export function normalize(text) {
  return String(text == null ? '' : text).normalize('NFD').replace(MARKS, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

const exact = (p) => new RegExp(`^${p.replace(/\//g, '\\/')}$`);

/** Header primary navigation per role. `count` is evaluated at render time so badges follow the backend data. */
export function primaryNav(role, adminCounts) {
  if (role === 'learner') {
    return [
      { href: '/dashboard', label: 'Trang chủ', icon: 'home', match: /^\/(dashboard|learn)(\/|$)/ },
      { href: '/courses', label: 'Khoá học', icon: 'book-open', match: /^\/(courses|cart|checkout)(\/|$)/ },
      // Scores, study statistics and the knowledge map are tabs of one page; /insights/* redirect into it.
      { href: '/progress', label: 'Kết quả học tập', icon: 'bar-chart', match: /^\/(progress|insights)(\/|$)/ },
      { href: '/ai', label: 'AI', icon: 'sparkles', match: /^\/ai(\/|$)/ },
    ];
  }
  if (role === 'lecturer') {
    const n = teachCounts();
    return [
      { href: '/teach', label: 'Tổng quan', icon: 'layout-dashboard', match: exact('/teach') },
      { href: '/teach/courses', label: 'Khoá học của tôi', icon: 'book-open', match: /^\/teach\/(courses|new)(\/|$)/ },
      { href: '/teach/grading', label: 'Chấm bài', icon: 'clipboard-check', match: /^\/teach\/grading(\/|$)/, count: n.grading, countLabel: 'bài chờ chấm' },
      { href: '/teach/questions', label: 'Hỏi đáp', icon: 'message-circle', match: /^\/teach\/questions(\/|$)/, count: n.questions, countLabel: 'câu hỏi chưa trả lời' },
      { href: '/teach/insights', label: 'Doanh thu', icon: 'trending-up', match: /^\/teach\/insights(\/|$)/ },
    ];
  }
  if (role === 'admin') {
    const { pending = 0, reconciliation: recon = 0 } = adminCounts || {};
    return [
      { href: '/admin', label: 'Tổng quan', icon: 'layout-dashboard', match: exact('/admin') },
      { href: '/admin/publication', label: 'Duyệt xuất bản', icon: 'clipboard-check', match: /^\/admin\/publication(\/|$)/, count: pending, countLabel: 'khoá học chờ duyệt' },
      { href: '/admin/users', label: 'Người dùng', icon: 'users', match: /^\/admin\/users(\/|$)/ },
      { href: '/admin/orders', label: 'Đơn hàng', icon: 'receipt', match: /^\/admin\/orders(\/|$)/, count: recon, countLabel: 'đơn cần đối soát' },
      { href: '/admin/finance', label: 'Tài chính', icon: 'wallet', match: /^\/admin\/finance(\/|$)/ },
    ];
  }
  return [
    { href: '/courses', label: 'Khoá học', icon: 'book-open', match: /^\/courses(\/|$)/ },
    { href: '/ai', label: 'AI', icon: 'sparkles', match: /^\/ai(\/|$)/ },
  ];
}

export const roleHomeLabel = (role) => (role === 'admin' ? 'Bảng quản trị' : role === 'lecturer' ? 'Khu vực giảng dạy' : 'Trang chủ');

/** Account menu links (real user-menu.tsx), plus "Đơn hàng của tôi" for learners. */
export function accountLinks(role) {
  if (role === 'guest') return [];
  const out = [{ href: Codi.homeFor(role), label: roleHomeLabel(role), icon: 'layout-dashboard' }];
  if (role === 'learner') out.push({ href: '/progress', label: 'Kết quả học tập', icon: 'bar-chart' });
  out.push({ href: '/profile', label: 'Hồ sơ cá nhân', icon: 'user' });
  if (role === 'learner') {
    out.push({ href: '/profile?tab=nang-luc', label: 'Hồ sơ năng lực', icon: 'github' });
    out.push({ href: '/profile?tab=transactions', label: 'Đơn hàng của tôi', icon: 'receipt' });
  }
  out.push({ href: '/settings', label: 'Cài đặt', icon: 'settings' });
  return out;
}

const ACCOUNT_PAGES = [
  { href: '/profile', title: 'Hồ sơ cá nhân', subtitle: 'Thông tin, khoá học, hoạt động', icon: 'user', keywords: 'profile ho so ca nhan tai khoan avatar anh dai dien' },
  { href: '/settings', title: 'Cài đặt', subtitle: 'Thông tin tài khoản', icon: 'settings', keywords: 'setting cai dat tai khoan ten email' },
  { href: '/settings?tab=security', title: 'Đổi mật khẩu', subtitle: 'Cài đặt · Mật khẩu & Bảo mật', icon: 'key', keywords: 'doi mat khau password bao mat thiet bi dang nhap phien security' },
  { href: '/settings?tab=connections', title: 'Tài khoản liên kết', subtitle: 'Cài đặt · Google, GitHub', icon: 'link', keywords: 'lien ket google github connections ket noi' },
];

const PAGES = {
  guest: [
    { href: '/', title: 'Trang chủ', subtitle: 'Giới thiệu Codi', icon: 'home', keywords: 'home trang chu gioi thieu' },
    { href: '/courses', title: 'Khoá học', subtitle: 'Danh mục khoá học lập trình', icon: 'book-open', keywords: 'catalog danh muc khoa hoc mua tim' },
    { href: '/ai', title: 'AI Tutor', subtitle: 'Hỏi AI về khoá học, bài học và lộ trình', icon: 'sparkles', keywords: 'ai tutor tu van chatbot lo trinh goi y' },
    { href: '/cart', title: 'Giỏ hàng', subtitle: 'Đăng nhập để xem giỏ hàng', icon: 'cart', keywords: 'gio hang cart thanh toan mua' },
    { href: '/login', title: 'Đăng nhập', subtitle: 'Vào tài khoản Codi', icon: 'arrow-right', keywords: 'dang nhap login sign in' },
    { href: '/register', title: 'Đăng ký', subtitle: 'Tạo tài khoản mới', icon: 'user', keywords: 'dang ky tao tai khoan register sign up' },
    { href: '/forgot-password', title: 'Quên mật khẩu', subtitle: 'Đặt lại mật khẩu qua email', icon: 'key', keywords: 'quen mat khau doi mat khau password reset' },
  ],
  learner: [
    { href: '/dashboard', title: 'Trang chủ', subtitle: 'Bài học tiếp theo, mục tiêu tuần, khoá học của tôi', icon: 'home', keywords: 'dashboard trang chu tong quan ban lam viec hoc tiep' },
    { href: '/courses', title: 'Khoá học', subtitle: 'Danh mục khoá học', icon: 'book-open', keywords: 'catalog danh muc khoa hoc mua tim' },
    { href: '/cart', title: 'Giỏ hàng', subtitle: 'Khoá học chờ thanh toán', icon: 'cart', keywords: 'gio hang cart thanh toan mua voucher ma giam gia' },
    { href: '/progress', title: 'Sổ điểm', subtitle: 'Kết quả học tập', icon: 'graduation-cap', keywords: 'so diem ket qua hoc tap tien do progress quiz bai tap nhan xet' },
    { href: '/progress?show=done', title: 'Khoá học đã hoàn thành', subtitle: 'Kết quả học tập', icon: 'check-circle', keywords: 'hoan thanh xong done chung chi' },
    { href: '/progress?tab=stats', title: 'Thống kê học tập', subtitle: 'Kết quả học tập · Giờ học, chuỗi ngày, điểm', icon: 'bar-chart', keywords: 'thong ke stats insights bieu do thoi gian' },
    { href: '/progress?tab=map', title: 'Bản đồ kiến thức', subtitle: 'Kết quả học tập · Mức thành thạo theo khái niệm', icon: 'map', keywords: 'ban do kien thuc knowledge map mastery thanh thao' },
    { href: '/ai', title: 'AI Tutor', subtitle: 'Hỏi AI về khoá học, bài học và lộ trình', icon: 'sparkles', keywords: 'ai tutor tu van chatbot lo trinh goi y' },
    { href: '/profile?tab=nang-luc', title: 'Hồ sơ năng lực', subtitle: 'Phân tích từ GitHub', icon: 'github', keywords: 'ho so nang luc github ky nang' },
    { href: '/profile?tab=transactions', title: 'Đơn hàng của tôi', subtitle: 'Giao dịch và biên lai', icon: 'receipt', keywords: 'don hang giao dich bien lai hoa don thanh toan lich su mua' },
    { href: '/onboarding/github', title: 'Kết nối GitHub', subtitle: 'Bước tài khoản tuỳ chọn', icon: 'git-branch', keywords: 'github ket noi lien ket' },
    ...ACCOUNT_PAGES,
  ],
  lecturer: [
    { href: '/teach', title: 'Tổng quan giảng dạy', subtitle: 'Việc cần làm hôm nay', icon: 'layout-dashboard', keywords: 'tong quan dashboard giang day trang chu' },
    { href: '/teach/courses', title: 'Khoá học của tôi', subtitle: 'Soạn và xuất bản', icon: 'book-open', keywords: 'khoa hoc cua toi soan xuat ban' },
    { href: '/teach/new', title: 'Tạo khoá học', subtitle: 'Khoá học mới', icon: 'plus', keywords: 'tao khoa hoc moi new' },
    { href: '/teach/grading', title: 'Chấm bài', subtitle: 'Bài nộp của học viên', icon: 'clipboard-check', keywords: 'cham bai bai nop grading diem' },
    { href: '/teach/questions', title: 'Hỏi đáp', subtitle: 'Câu hỏi của học viên', icon: 'message-circle', keywords: 'hoi dap cau hoi questions tra loi' },
    { href: '/teach/questions?view=conversations', title: 'Hội thoại chuyển từ AI', subtitle: 'Hỏi đáp', icon: 'message-circle', keywords: 'hoi thoai ai tro ly chuyen tiep' },
    { href: '/teach/reviews', title: 'Đánh giá', subtitle: 'Đánh giá khoá học', icon: 'star', keywords: 'danh gia review sao phan hoi' },
    { href: '/teach/progress', title: 'Tiến độ học viên', subtitle: 'Theo khoá học', icon: 'bar-chart', keywords: 'tien do hoc vien progress' },
    { href: '/teach/snippets', title: 'Mẫu nhận xét', subtitle: 'Dùng khi chấm bài', icon: 'list', keywords: 'mau nhan xet snippet' },
    { href: '/teach/insights', title: 'Doanh thu khoá học', subtitle: 'Kinh doanh', icon: 'trending-up', keywords: 'doanh thu thu nhap revenue' },
    { href: '/courses', title: 'Danh mục khoá học', subtitle: 'Trang bán công khai', icon: 'book-open', keywords: 'catalog danh muc cong khai' },
    ...ACCOUNT_PAGES,
  ],
  admin: [
    { href: '/admin', title: 'Tổng quan quản trị', subtitle: 'KPI và việc cần xử lý', icon: 'layout-dashboard', keywords: 'tong quan dashboard quan tri' },
    { href: '/admin/publication', title: 'Duyệt xuất bản', subtitle: 'Khoá học chờ duyệt', icon: 'clipboard-check', keywords: 'duyet xuat ban kiem duyet review' },
    { href: '/admin/courses', title: 'Khoá học đã xuất bản', subtitle: 'Giá, ẩn/hiện', icon: 'book-open', keywords: 'khoa hoc gia an hien' },
    { href: '/admin/users', title: 'Người dùng', subtitle: 'Tài khoản và vai trò', icon: 'users', keywords: 'nguoi dung user tai khoan vo hieu hoa' },
    { href: '/admin/orders', title: 'Đơn hàng & giao dịch', subtitle: 'Vận hành', icon: 'receipt', keywords: 'don hang giao dich order thanh toan' },
    { href: '/admin/orders?reconciliation=1&range=all', title: 'Đơn cần đối soát', subtitle: 'Đơn hàng', icon: 'alert-triangle', keywords: 'doi soat thieu tien reconciliation' },
    { href: '/admin/vouchers', title: 'Voucher', subtitle: 'Mã giảm giá', icon: 'ticket', keywords: 'voucher ma giam gia khuyen mai coupon' },
    { href: '/admin/insights', title: 'Quan sát hệ thống', subtitle: 'Phân tích', icon: 'bar-chart', keywords: 'quan sat he thong insights phan tich' },
    { href: '/admin/finance', title: 'Tài chính', subtitle: 'Doanh thu, đơn hàng', icon: 'wallet', keywords: 'tai chinh doanh thu finance' },
    { href: '/courses', title: 'Danh mục khoá học', subtitle: 'Trang bán công khai', icon: 'book-open', keywords: 'catalog danh muc cong khai' },
    ...ACCOUNT_PAGES,
  ],
};

export const pagesFor = (role) => PAGES[role] || PAGES.guest;
