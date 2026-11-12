/**
 * Backend client. Same-origin (Vite proxies /api to the backend), so the Better Auth session cookie rides along.
 *
 *   const courses = await api('/api/courses');                       // GET, parsed JSON
 *   await api('/api/orders/checkout', { method: 'POST', body: {...} }); // JSON body
 *   const data = await api.action('dashboard/lecturer', 'getLecturerCourses');  // server action, args spread
 *
 * Throws ApiError (message = the server's `error`, status = HTTP status) on a non-2xx reply or a network failure.
 */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const FALLBACK = { 0: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 401: 'Vui lòng đăng nhập.', 403: 'Bạn không có quyền thực hiện thao tác này.', 404: 'Không tìm thấy.' };
const fallbackMessage = (status) => FALLBACK[status] || (status >= 500 ? 'Lỗi máy chủ. Vui lòng thử lại.' : 'Yêu cầu không hợp lệ.');

export async function api(url, { method = 'GET', body, headers, signal } = {}) {
  const init = { method, credentials: 'include', headers: { Accept: 'application/json', ...headers }, signal };
  if (body !== undefined) {
    if (body instanceof FormData) init.body = body;
    else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError(fallbackMessage(0), 0, null);
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const message = (data && typeof data === 'object' && (data.error || data.message)) || fallbackMessage(res.status);
    throw new ApiError(typeof message === 'string' ? message : fallbackMessage(res.status), res.status, data);
  }
  return data;
}

api.get = (url, opts) => api(url, { ...opts, method: 'GET' });
api.post = (url, body, opts) => api(url, { ...opts, method: 'POST', body: body === undefined ? {} : body });
api.put = (url, body, opts) => api(url, { ...opts, method: 'PUT', body });
api.patch = (url, body, opts) => api(url, { ...opts, method: 'PATCH', body });
api.del = (url, body, opts) => api(url, { ...opts, method: 'DELETE', body });

/** Calls a backend server action: POST /api/actions/<module>/<name> with the arguments as a JSON array. */
api.action = (module, name, ...args) => api.actionWith(module, name, args);
/** Same as api.action with the arguments as an array and request options, e.g. `{ signal }` to abort the wait. */
api.actionWith = (module, name, args = [], opts) => api(`/api/actions/${module}/${name}`, { ...opts, method: 'POST', body: args });
