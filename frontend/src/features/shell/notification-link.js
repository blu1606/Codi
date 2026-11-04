/**
 * Turns a stored notification link into a rebuild route. The backend (and Codi before it) stores Codi-style hrefs such
 * as /dashboard/lecturer/courses/<id>/publish or /dashboard/admin/publication?tab=pending; the rebuild serves those
 * screens under /teach and /admin. Returns null for anything that is not an app-relative path.
 */
const LEGACY_PREFIXES = [
  ['/dashboard/lecturer', '/teach'],
  ['/dashboard/admin', '/admin'],
];

export function notificationPath(link) {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || /[\\\u0000- ]/.test(link)) return null;
  for (const [from, to] of LEGACY_PREFIXES) {
    if (link === from || link.startsWith(`${from}/`) || link.startsWith(`${from}?`)) return `${to}${link.slice(from.length)}`;
  }
  return link;
}
