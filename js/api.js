/* PassDelivery — слой работы с бэкендом (контракт: openapi.yaml) */
import { API_BASE } from './config.js';

const LS = { token: 'pass_token', api: 'pass_api' };
export const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};

store.del(LS.api); // убираем старый адрес, который раньше сохранялся из интерфейса

export const session = {
  base: API_BASE,
  token: store.get(LS.token),
  onUnauthorized: () => {},
  setToken(t){ this.token = t; t ? store.set(LS.token, t) : store.del(LS.token); },
};

export class ApiError extends Error {
  constructor(status, body){ super(body?.message || body?.error || ('HTTP ' + status)); this.status = status; this.body = body; }
}

async function api(method, path, body){
  // FormData (загрузка фото) браузер кодирует сам и сам ставит Content-Type с границей multipart
  const form = body instanceof FormData;
  const headers = form ? {} : { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = 'Bearer ' + session.token;
  let res;
  try {
    res = await fetch(session.base + path, { method, headers, body: form ? body : body ? JSON.stringify(body) : undefined });
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

function photoForm(blob){ const f = new FormData(); f.append('photo', blob, 'photo.jpg'); return f; }

export const Api = {
  register:   (b)  => api('POST',   '/auth/register', b),
  login:      (b)  => api('POST',   '/auth/login', b),
  me:         ()   => api('GET',    '/users/me'),
  updateMe:   (b)  => api('PATCH',  '/users/me', b),
  uploadAvatar: (blob) => api('POST', '/users/me/avatar', photoForm(blob)),
  addresses:  ()   => api('GET',    '/users/me/addresses'),
  addAddress: (b)  => api('POST',   '/users/me/addresses', b),
  delAddress: (id) => api('DELETE', '/users/me/addresses/' + id),
  updateAddress: (id, b) => api('PATCH', '/users/me/addresses/' + id, b),

  // публичный каталог
  restaurants: ()   => api('GET', '/restaurants'),
  restaurant:  (id) => api('GET', '/restaurants/' + id),
  menu:        (id) => api('GET', '/restaurants/' + id + '/menu'),

  // корзина покупателя
  cart:           ()            => api('GET',    '/cart'),
  clearCart:      ()            => api('DELETE', '/cart'),
  addToCart:      (dishId, qty) => api('POST',   '/cart/items', { dish_id: dishId, quantity: qty }),
  setCartItemQty: (itemId, qty) => api('PATCH',  '/cart/items/' + itemId, { quantity: qty }),
  removeCartItem: (itemId)      => api('DELETE', '/cart/items/' + itemId),

  // заказы покупателя
  orders:        ()   => api('GET',  '/orders'),
  createOrder:   (b)  => api('POST', '/orders', b),
  order:         (id) => api('GET',  '/orders/' + id),
  cancelOrder:   (id) => api('POST', '/orders/' + id + '/cancel'),
  orderHistory:  (id) => api('GET',  '/orders/' + id + '/status-history'),

  // курьер
  courierStatus:     ()           => api('GET',    '/courier/status'),
  setCourierStatus:  (status)     => api('PATCH',  '/courier/status', { status }),
  courierDeliveries: ()           => api('GET',    '/courier/deliveries'),
  courierHistory:    ()           => api('GET',    '/courier/deliveries/history'),
  courierRating:     ()           => api('GET',    '/courier/rating'),
  acceptDelivery:    (id)         => api('POST',   '/courier/deliveries/' + id + '/accept'),
  refuseDelivery:    (id)         => api('DELETE', '/courier/deliveries/' + id + '/refuse'),
  setDeliveryStatus: (id, status) => api('PATCH',  '/courier/deliveries/' + id + '/status', { status }),

  // отзывы
  restaurantReviews: (restId)     => api('GET',  '/restaurants/' + restId + '/reviews'),
  createReview:      (orderId, b) => api('POST', '/orders/' + orderId + '/review', b),

  // уведомления (покупатель, владелец, курьер)
  notifications:    ()   => api('GET',   '/notifications'),
  readNotification: (id) => api('PATCH', '/notifications/' + id + '/read'),

  // кабинет владельца ресторана
  myRestaurants:    ()      => api('GET',   '/internal/restaurants'),
  createRestaurant: (b)     => api('POST',  '/internal/restaurants', b),
  updateRestaurant: (id, b) => api('PATCH', '/internal/restaurants/' + id, b),
  categories:  (restId)    => api('GET',  '/internal/restaurants/' + restId + '/categories'),
  ownerDishes: (restId)    => api('GET',  '/internal/restaurants/' + restId + '/dishes'),
  addCategory: (restId, b) => api('POST', '/internal/restaurants/' + restId + '/categories', b),
  addDish:     (restId, b) => api('POST', '/internal/restaurants/' + restId + '/dishes', b),
  updateDish:  (dishId, b) => api('PATCH', '/internal/dishes/' + dishId, b),
  hideDish:    (dishId)    => api('DELETE', '/internal/dishes/' + dishId),
  uploadRestaurantPhoto: (restId, blob) => api('POST', '/internal/restaurants/' + restId + '/photo', photoForm(blob)),
  uploadDishPhoto:       (dishId, blob) => api('POST', '/internal/dishes/' + dishId + '/photo', photoForm(blob)),

  // заказы (фича orders)
  setOrderStatus:   (orderId, status) => api('PATCH', '/internal/orders/' + orderId + '/status', { status }),
  restaurantOrders: (restId)          => api('GET',   '/internal/restaurants/' + restId + '/orders'),
};
