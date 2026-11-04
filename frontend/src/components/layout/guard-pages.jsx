import { Link } from 'react-router-dom';
import { Codi, ROLE_LABEL } from '../../lib/codi';
import { Empty } from '../ui/primitives';

export function NotFoundPage() {
  return (
    <div className="page page-narrow">
      <Empty icon="map" title="Không tìm thấy trang" body="Đường dẫn này không tồn tại hoặc đã thay đổi."
        actions={<Link className="btn btn-primary" to={Codi.homeFor(Codi.role())}>Về trang chính</Link>} />
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="page page-narrow">
      <Empty icon="lock" title="Bạn không có quyền truy cập trang này" body={`Tài khoản ${ROLE_LABEL[Codi.role()] || ''} không dùng được khu vực này.`}
        actions={<Link className="btn btn-primary" to={Codi.homeFor(Codi.role())}>Về trang của bạn</Link>} />
    </div>
  );
}

export function SignInRequiredPage() {
  return (
    <div className="page page-narrow">
      <Empty icon="lock" title="Vui lòng đăng nhập" body="Trang này chỉ dành cho người dùng đã đăng nhập."
        actions={<button type="button" className="btn btn-primary" onClick={() => Codi.openSignIn(() => {}, { resume: true })}>Đăng nhập</button>} />
    </div>
  );
}
