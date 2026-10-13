/* PassDelivery — корзина покупателя (макет 04-cart, node 37:1449)
   Корзину целиком отдаёт бэк после каждого изменения — здесь только держим её и перерисовываем */
import { Api } from './api.js';
import { $, say, busy, errText, price, placeholderBg, showPage } from './ui.js';

const EMPTY = { restaurant_id: null, restaurant_name: null, items: [], total_kopecks: 0 };

let cart = null;
const listeners = new Set();

export const getCart = () => cart;
export const onCartChange = (fn) => listeners.add(fn);
export const itemOf = (dishId) => cart?.items.find(i => i.dish_id === dishId) || null;

const count = () => (cart?.items || []).reduce((n, i) => n + i.quantity, 0);

function set(next){
  cart = next || EMPTY;
  renderBadge();
  renderPage();
  listeners.forEach(fn => fn(cart));
}

export async function loadCart(){
  try { set(await Api.cart()); }
  catch { /* бэк без корзины или не покупатель — просто не показываем её */ }
}

export function resetCart(){ cart = null; renderBadge(); }

function renderBadge(){
  const n = count();
  $('cart-count').textContent = n > 99 ? '99+' : String(n);
  $('cart-count').hidden = n === 0;
}

/* ---------- действия (их же вызывает меню ресторана) ---------- */
const anotherRestaurant = (e) => e.status === 409 && (e.body?.error || '').includes('another restaurant');

// true — добавили; false — пользователь отказался менять ресторан
export async function addDish(dish){
  try {
    set(await Api.addToCart(dish.id, 1));
    return true;
  } catch (e) {
    if (!anotherRestaurant(e)) throw e;
    const from = cart?.restaurant_name ? '«' + cart.restaurant_name + '»' : 'другого ресторана';
    if (!confirm('В корзине уже есть блюда из ' + from + '. Очистить корзину и добавить «' + dish.name + '»?')) return false;
    await Api.clearCart();
    set(await Api.addToCart(dish.id, 1));
    return true;
  }
}

export async function changeQty(item, qty){
  if (qty < 1) return removeItem(item);
  set(await Api.setCartItemQty(item.id, qty));
}

export async function removeItem(item){
  set(await Api.removeCartItem(item.id));
}

export function cartError(e){
  if (e.status === 404 && !e.body) return 'Корзина пока недоступна: на сервере нет ручек /cart';
  if (e.status === 404) return 'Позиция не найдена — обновите страницу';
  if (e.status === 409) return 'Это блюдо сейчас недоступно для заказа';
  if (e.status === 403) return 'Корзина доступна только покупателям';
  return errText(e);
}

/* ---------- страница корзины ---------- */
export async function openCart(){
  showPage('cart');
  say('cart-msg', '');
  if (cart) renderPage();
  try { set(await Api.cart()); }
  catch (e) { say('cart-msg', cartError(e), 'err'); if (!cart) set(EMPTY); }
}

function renderPage(){
  if (!cart) return;
  const empty = cart.items.length === 0;
  $('cart-layout').hidden = empty;
  $('cart-empty').hidden = !empty;

  const rest = $('cart-rest');
  rest.hidden = empty || !cart.restaurant_id;
  rest.textContent = cart.restaurant_name || '';
  if (cart.restaurant_id) rest.href = '#/restaurants/' + cart.restaurant_id;
  if (empty) return;

  const list = $('cart-list'); list.textContent = '';
  for (const item of cart.items) list.append(row(item));

  $('cart-goods').textContent = price(cart.total_kopecks);
  $('cart-total').textContent = price(cart.total_kopecks);

  const off = cart.items.filter(i => !i.is_available);
  $('cart-checkout').classList.toggle('is-disabled', off.length > 0);
  $('cart-checkout').setAttribute('aria-disabled', String(off.length > 0));
  $('cart-warn').hidden = off.length === 0;
  $('cart-warn').textContent = off.length
    ? 'Нет в наличии: ' + off.map(i => i.name).join(', ') + '. Уберите эти позиции перед оформлением.'
    : '';
}

function row(item){
  const el = document.createElement('div');
  el.className = 'cart-row' + (item.is_available ? '' : ' cart-row--off');

  const thumb = document.createElement('span'); thumb.className = 'cart-row__thumb';
  thumb.style.background = placeholderBg(item.dish_id);
  thumb.textContent = (item.name || '·')[0].toUpperCase(); thumb.setAttribute('aria-hidden', 'true');

  const info = document.createElement('div'); info.className = 'cart-row__info';
  const name = document.createElement('div'); name.className = 'cart-row__name'; name.textContent = item.name;
  const sub = document.createElement('div'); sub.className = 'cart-row__sub';
  sub.textContent = item.is_available ? price(item.price_kopecks) + ' за шт.' : 'Нет в наличии';
  info.append(name, sub);

  const total = document.createElement('div'); total.className = 'cart-row__total'; total.textContent = price(item.total_kopecks);

  const del = document.createElement('button');
  del.type = 'button'; del.className = 'icon-btn cart-row__del'; del.textContent = '✕';
  del.setAttribute('aria-label', 'Убрать ' + item.name);
  del.onclick = () => act(el, () => removeItem(item));

  el.append(thumb, info, stepper(item, el), total, del);
  return el;
}

export function stepper(item, lockEl){
  const box = document.createElement('div'); box.className = 'stepper';
  const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−';
  minus.setAttribute('aria-label', item.quantity === 1 ? 'Убрать ' + item.name : 'Меньше');
  const n = document.createElement('span'); n.textContent = item.quantity; n.setAttribute('aria-live', 'polite');
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Больше');
  plus.disabled = item.quantity >= 99 || !item.is_available;
  minus.onclick = () => act(lockEl || box, () => changeQty(item, item.quantity - 1));
  plus.onclick = () => act(lockEl || box, () => changeQty(item, item.quantity + 1));
  box.append(minus, n, plus);
  return box;
}

// Блокируем кнопки строки, пока идёт запрос, и показываем ошибку там, где пользователь сейчас
async function act(el, fn){
  el.querySelectorAll('button').forEach(b => busy(b, true));
  try { await fn(); }
  catch (e) {
    const msgId = $('cart-layout').offsetParent ? 'cart-msg' : 'r-msg';
    say(msgId, cartError(e), 'err');
    el.querySelectorAll('button').forEach(b => busy(b, false));
  }
}

$('cart-checkout').addEventListener('click', (e) => {
  if ($('cart-checkout').classList.contains('is-disabled')) e.preventDefault();
});

$('cart-clear').onclick = async () => {
  if (!confirm('Убрать из корзины все блюда?')) return;
  const btn = $('cart-clear'); busy(btn, true);
  try { await Api.clearCart(); set(EMPTY); }
  catch (e) { say('cart-msg', cartError(e), 'err'); }
  finally { busy(btn, false); }
};
