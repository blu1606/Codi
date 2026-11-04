// Formatters ported from the mockup runtime (Codi.fmt).
const pad = (n) => String(n).padStart(2, '0');

export const fmt = {
  num: (n) => Number(n || 0).toLocaleString('vi-VN'),
  vnd: (n) => Number(n || 0).toLocaleString('vi-VN') + ' ₫',
  date: (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
  datetime: (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
  relative: (iso) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' ngày trước';
    return fmt.date(iso);
  },
  duration: (min) => {
    min = Math.round(min || 0);
    const h = Math.floor(min / 60); const m = min % 60;
    if (!h) return m + ' phút';
    return m ? `${h} giờ ${m} phút` : `${h} giờ`;
  },
};
