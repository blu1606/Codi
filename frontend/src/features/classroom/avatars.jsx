// Hand-drawn SVG avatars of the six AI classroom characters (ported from the DRE classroom artwork).
// <ClassmateAvatar id="bo" size={40} state="speaking" /> — state adds a ring: "speaking" (accent) or "thinking" (dashed).

export const CLASSMATES = {
  colam: { name: 'Cô Lam', role: 'Giáo viên chủ trì', tint: '#E0F3ED', ring: '#4E9B87' },
  bo: { name: 'Bo', role: 'Bạn học hay cãi', tint: '#FFF4DE', ring: '#E8A33D' },
  tri: { name: 'Trí', role: 'Đào sâu bản chất', tint: '#EBF0FF', ring: '#4B6CB7' },
  linhchi: { name: 'Linh Chi', role: 'Sổ tay ghi nhớ', tint: '#FFF0F5', ring: '#E27396' },
  minhkhang: { name: 'Minh Khang', role: 'Ví dụ đời thường', tint: '#E0F7FA', ring: '#0097A7' },
  an: { name: 'Trợ giảng An', role: 'Gợi ý từng bước', tint: '#E8F5F1', ring: '#2E6859' },
};
export const CLASSMATE_IDS = ['colam', 'bo', 'tri', 'linhchi', 'minhkhang', 'an'];

function CoLamArt() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#E0F3ED" />
      <path d="M22 52 C20 28, 38 16, 50 16 C66 16, 80 28, 78 52 C74 44, 68 36, 56 36 C42 36, 32 44, 22 52 Z" fill="#2B3632" />
      <circle cx="50" cy="14" r="8" fill="#2B3632" />
      <path d="M62 26 C68 22, 70 28, 62 28 Z" fill="#4E9B87" />
      <path d="M28 46 C28 72, 72 72, 72 46 C72 42, 28 42, 28 46 Z" fill="#FFF0E3" />
      <circle cx="39" cy="50" r="7.5" stroke="#4E9B87" strokeWidth="2.2" fill="white" fillOpacity="0.4" />
      <circle cx="61" cy="50" r="7.5" stroke="#4E9B87" strokeWidth="2.2" fill="white" fillOpacity="0.4" />
      <path d="M46.5 50 L53.5 50" stroke="#4E9B87" strokeWidth="2" />
      <path d="M35 50 Q39 46 43 50" stroke="#2B3632" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M57 50 Q61 46 65 50" stroke="#2B3632" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <ellipse cx="33" cy="58" rx="4.5" ry="3" fill="#F49E9E" opacity="0.45" />
      <ellipse cx="67" cy="58" rx="4.5" ry="3" fill="#F49E9E" opacity="0.45" />
      <path d="M44 61 Q50 67 56 61" stroke="#2B3632" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M32 76 C38 72, 62 72, 68 76 L72 88 L28 88 Z" fill="#4E9B87" />
      <path d="M46 75 L50 82 L54 75" fill="#FFFFFF" />
    </svg>
  );
}

function BoArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#FFF4DE" />
      <path d="M9 36 C10 27, 30 27, 31 36 Z" fill="#E8963D" />
      <path d="M17 31 L20 35 L23 31" fill="#D47B22" />
      <circle cx="20" cy="19" r="8.5" fill="#FFE5CC" />
      <path d="M10 17 C9 10, 31 10, 30 17 C28 13, 25 12, 20 13 C16 12, 12 13, 10 17 Z" fill="#423429" />
      <circle cx="14.5" cy="21.5" r="1.5" fill="#F59E7A" opacity="0.6" />
      <circle cx="25.5" cy="21.5" r="1.5" fill="#F59E7A" opacity="0.6" />
      <circle cx="16" cy="18.5" r="1.2" fill="#2B211A" />
      <circle cx="24" cy="18.5" r="1.2" fill="#2B211A" />
      <path d="M17.5 22.5 Q20 24.5 22.5 22.5" stroke="#2B211A" strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function TriArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#EDF2FF" />
      <path d="M10 18 C10 8, 30 7, 30 18 C28 12, 23 11, 20 12 C16 11, 12 12, 10 18 Z" fill="#1E2A38" />
      <circle cx="20" cy="20" r="8.5" fill="#FFE8D6" />
      <circle cx="16.5" cy="18.5" r="1.3" fill="#1E2A38" />
      <circle cx="23.5" cy="18.5" r="1.3" fill="#1E2A38" />
      <path d="M15 15.5 Q17 14.5 19 16" stroke="#1E2A38" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M21 16 Q23 14.5 25 15.5" stroke="#1E2A38" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M18.5 23.5 L21.5 23.5" stroke="#1E2A38" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 36 C12 28, 28 28, 30 36 Z" fill="#3B5998" />
    </svg>
  );
}

function LinhChiArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#FFF2F6" />
      <circle cx="10" cy="15" r="3.5" fill="#3D261D" />
      <circle cx="30" cy="15" r="3.5" fill="#3D261D" />
      <path d="M10 20 C10 9, 30 9, 30 20 C26 14, 23 13, 20 13 C17 13, 14 14, 10 20 Z" fill="#3D261D" />
      <circle cx="12" cy="12" r="1.5" fill="#E27396" />
      <circle cx="20" cy="20" r="8.5" fill="#FFEFE5" />
      <circle cx="15" cy="22" r="1.8" fill="#FCA5A5" opacity="0.6" />
      <circle cx="25" cy="22" r="1.8" fill="#FCA5A5" opacity="0.6" />
      <circle cx="16.5" cy="19" r="1.2" fill="#2E2825" />
      <circle cx="23.5" cy="19" r="1.2" fill="#2E2825" />
      <path d="M18 23.5 Q20 25.5 22 23.5" stroke="#2E2825" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M10 36 C12 28, 28 28, 30 36 Z" fill="#EA7A8E" />
    </svg>
  );
}

function MinhKhangArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#E6FAFC" />
      <path d="M10 18 C9 8, 31 8, 30 18 C28 13, 24 11, 20 12 C16 11, 12 13, 10 18 Z" fill="#423429" />
      <circle cx="14" cy="9" r="2.5" fill="#423429" />
      <circle cx="20" cy="7" r="2.5" fill="#423429" />
      <circle cx="26" cy="9" r="2.5" fill="#423429" />
      <circle cx="20" cy="20" r="8.5" fill="#FFE8D6" />
      <circle cx="16.5" cy="19" r="1.5" fill="#2E2825" />
      <circle cx="16" cy="18.5" r="0.5" fill="white" />
      <circle cx="23.5" cy="19" r="1.5" fill="#2E2825" />
      <circle cx="23" cy="18.5" r="0.5" fill="white" />
      <path d="M18 23 Q20 26 22 23" stroke="#2E2825" strokeWidth="1.2" strokeLinecap="round" fill="#E86A58" />
      <path d="M10 36 C12 28, 28 28, 30 36 Z" fill="#00A896" />
    </svg>
  );
}

function AnArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#EBF7F3" />
      <path d="M10 18 C10 8, 30 8, 30 18 C28 14, 24 13, 20 13 C16 13, 12 14, 10 18 Z" fill="#2D3B36" />
      <circle cx="20" cy="20" r="9" fill="#FFE5D1" />
      <circle cx="17" cy="19" r="3" stroke="#2E6859" strokeWidth="1.2" fill="white" fillOpacity="0.4" />
      <circle cx="23" cy="19" r="3" stroke="#2E6859" strokeWidth="1.2" fill="white" fillOpacity="0.4" />
      <circle cx="17" cy="19" r="1" fill="#2D3B36" />
      <circle cx="23" cy="19" r="1" fill="#2D3B36" />
      <path d="M18 24 Q20 26 22 24" stroke="#2D3B36" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M11 36 C13 29, 27 29, 29 36 Z" fill="#4E9B87" />
    </svg>
  );
}

const ART = { colam: CoLamArt, bo: BoArt, tri: TriArt, linhchi: LinhChiArt, minhkhang: MinhKhangArt, an: AnArt };

/** Round avatar of a classroom character; decorative unless `label` is given. */
export function ClassmateAvatar({ id, size = 36, state, label }) {
  const meta = CLASSMATES[id];
  const Art = ART[id];
  if (!meta || !Art) return null;
  return (
    <span className={`cr-avatar ${state ? `is-${state}` : ''}`.trim()}
      style={{ width: size, height: size, '--cr-tint': meta.tint, '--cr-ring': meta.ring }}
      role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
      <Art />
    </span>
  );
}
