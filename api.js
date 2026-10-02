/* PassDelivery — слой работы с бэкендом (контракт: openapi.yaml) */
const LS = { token: 'pass_token', api: 'pass_api' };
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};

export const session = {
  base: store.get(LS.api) || 'http://localhost:5050',
  token: store.get(LS.token),
  onUnauthorized: () => {},
  setToken(t){ this.token = t; t ? store.set(LS.token, t) : store.del(LS.token); },
  setBase(b){ this.base = b.trim().replace(/\/$/, ''); store.set(LS.api, this.base); },
};

export class ApiError extends Error {
  constructor(status, body){ super(body?.message || body?.error || ('HTTP ' + status)); this.status = status; this.body = body; }
}

async function api(method, path, body){
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = 'Bearer ' + session.token;
  let res;
  try {
    res = await fetch(session.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { message: 'Нет связи с сервером ' + session.base + ' (проверьте, что бэкенд запущен и включён CORS)' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && session.token && !path.startsWith('/auth/')) session.onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

// PATCH /users/me/addresses/{id} пока нет на бэке
export const Api = {
  register:   (b)  => api('POST',   '/auth/register', b),
  login:      (b)  => api('POST',   '/auth/login', b),
  me:         ()   => api('GET',    '/users/me'),
  updateMe:   (b)  => api('PATCH',  '/users/me', b),
  addresses:  ()   => api('GET',    '/users/me/addresses'),
  addAddress: (b)  => api('POST',   '/users/me/addresses', b),
  delAddress: (id) => api('DELETE', '/users/me/addresses/' + id),
  // updateAddress: (id, b) => api('PATCH', '/users/me/addresses/' + id, b),  // TODO
};
