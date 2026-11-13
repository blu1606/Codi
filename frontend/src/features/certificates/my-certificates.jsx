// "Chứng chỉ của tôi" on the results page: every certificate the learner holds, newest first. Hidden until there is one.
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/use-api';
import { fmt } from '../../lib/format';
import { Icon } from '../../components/ui/primitives';
import { verifyPath } from './certificates-api';

export default function MyCertificates() {
  const { data } = useApi('/api/certificates');
  const list = (data && data.certificates) || [];
  if (!list.length) return null;
  return (
    <section className="card" aria-labelledby="my-certs-h"><div className="card-body stack-3">
      <h2 id="my-certs-h" className="rs-h2">Chứng chỉ của tôi</h2>
      <ul className="cert-list">
        {list.map((c) => (
          <li key={c.code}>
            <div className="cert-list-main">
              <Icon name="graduation-cap" className={`icon-lg ${c.status === 'valid' ? 'text-success' : 'muted'}`} />
              <div>
                <strong>{c.courseTitle}</strong>
                <span className="small muted">Cấp ngày {fmt.date(c.issuedAt)} · <span className="mono">{c.code}</span>
                  {c.status === 'revoked' && <> · <span className="text-danger strong">Đã thu hồi</span></>}</span>
              </div>
            </div>
            <Link className="btn btn-secondary btn-sm" to={verifyPath(c.code)}>Xem chứng chỉ</Link>
          </li>
        ))}
      </ul>
    </div></section>
  );
}
