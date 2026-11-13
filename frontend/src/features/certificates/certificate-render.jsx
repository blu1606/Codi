/**
 * The certificate itself: an A4-landscape sheet that scales with its container (sizes in container units), prints
 * as one page (certificates.css @media print) and stays paper-white in dark mode, because it is a document.
 * The QR code opens the public verification page. A revoked certificate carries a "Đã thu hồi" stamp.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { fmt } from '../../lib/format';
import { verifyUrl } from './certificates-api';

function useQrSvg(text) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((s) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(''); });
    return () => { live = false; };
  }, [text]);
  return svg;
}

export function lengthLabel(cert) {
  return `${cert.lessonCount} bài · ${fmt.duration(cert.totalMinutes)}`;
}

export default function CertificateRender({ cert }) {
  const url = verifyUrl(cert.code);
  const qr = useQrSvg(url);
  const revoked = cert.status === 'revoked';
  return (
    <div className="cert-frame">
      <article className={`cert ${revoked ? 'is-revoked' : ''}`.trim()} aria-label={`Chứng chỉ hoàn thành khoá học ${cert.courseTitle} của ${cert.recipientName}`}>
        <div className="cert-inner">
          <header className="cert-head">
            <span className="cert-brand"><span className="cert-brand-mark" aria-hidden="true">C</span>Codi</span>
            <span className="cert-code">Mã chứng chỉ <strong>{cert.code}</strong></span>
          </header>
          <div className="cert-body">
            <p className="cert-kicker">Chứng nhận hoàn thành khoá học</p>
            <p className="cert-lead">Trao cho</p>
            <p className="cert-name">{cert.recipientName}</p>
            <p className="cert-lead">đã hoàn thành toàn bộ bài học bắt buộc của khoá</p>
            <p className="cert-course">{cert.courseTitle}</p>
          </div>
          <footer className="cert-foot">
            <dl className="cert-meta">
              <div><dt>Ngày cấp</dt><dd>{fmt.date(cert.issuedAt)}</dd></div>
              <div><dt>Thời lượng</dt><dd>{lengthLabel(cert)}</dd></div>
              <div><dt>Giảng viên</dt><dd>{cert.lecturerName || 'Đội ngũ Codi'}</dd></div>
            </dl>
            <div className="cert-verify">
              {/* The QR library returns a plain SVG for a URL we built; it carries no user input. */}
              <span className="cert-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />
              <span className="cert-verify-text">Quét mã hoặc mở<br /><span className="cert-url">{url.replace(/^https?:\/\//, '')}</span><br />để xác minh</span>
            </div>
          </footer>
        </div>
        {revoked && <span className="cert-stamp" aria-hidden="true">Đã thu hồi</span>}
      </article>
    </div>
  );
}
