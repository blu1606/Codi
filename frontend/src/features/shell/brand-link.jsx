/**
 * Codi brand: the product mark (/brand/codi-logo.svg) plus the word "Codi", one link to the role's home.
 * If the image cannot load, the CSS "C" square stands in (remembered for the session so it never flickers).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';

export const LOGO_SRC = '/brand/codi-logo.svg';
let logoFailed = false;

/** The 28 px mark alone (decorative). */
export function BrandMark({ size = 28 }) {
  const [failed, setFailed] = useState(logoFailed);
  if (failed) return <span className="logo-mark" aria-hidden="true" style={{ width: size, height: size }}>C</span>;
  return <img className="hd-brand-img" src={LOGO_SRC} alt="" width={size} height={size} onError={() => { logoFailed = true; setFailed(true); }} />;
}

export default function BrandLink({ to }) {
  const href = to || Codi.homeFor(Codi.role());
  return (
    <Link className="logo hd-brand" to={href} aria-label="Codi — Trang chính">
      <BrandMark />
      <span className="hd-brand-word">Codi</span>
    </Link>
  );
}
