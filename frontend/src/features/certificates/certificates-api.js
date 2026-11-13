// Certificates API: GET /api/certificates/:code (public), POST it with { action } (holder: rename; admin: revoke /
// restore), GET /api/certificates (the signed-in learner's list).
import { api } from '../../lib/api';

export const certificateApi = {
  get: (code) => api(`/api/certificates/${encodeURIComponent(code)}`),
  act: (code, body) => api(`/api/certificates/${encodeURIComponent(code)}`, { method: 'POST', body }),
  mine: () => api('/api/certificates'),
};

// Mirrors the backend's normalizeCertificateCode: case, spaces and dashes ignored, CODI- optional, O/I/L = 0/1/1.
const ALPHABET = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export function normalizeCode(input) {
  let s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  if (s.startsWith('CODI')) s = s.slice(4);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  return ALPHABET.test(s) ? `CODI-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export const verifyPath = (code) => `/verify/${code}`;
export const verifyUrl = (code) => `${window.location.origin}${verifyPath(code)}`;

/** LinkedIn "Add licence or certification" prefilled form. */
export function linkedInUrl(cert) {
  const d = new Date(cert.issuedAt);
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME', name: cert.courseTitle, organizationName: 'Codi',
    issueYear: String(d.getFullYear()), issueMonth: String(d.getMonth() + 1), certUrl: verifyUrl(cert.code), certId: cert.code,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}
