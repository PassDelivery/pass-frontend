import { session, Api, store } from './api.js';
import { $, say, busy, errText, initials, showPage } from './ui.js';
import { openOwner, resetOwner } from './owner.js';
import { openCatalog, openRestaurant, setQuery, setCanOrder } from './catalog.js';
import { openCart, loadCart, resetCart } from './cart.js';
import { openCheckout, openOrder, leaveOrder, loadOrderHistory } from './orders.js';
import { openCourier, resetCourier } from './courier.js';
import { startNotifications, stopNotifications } from './notifications.js';

/* ===================== UI ===================== */
const roleNames = { customer:'Клиент', restaurant_owner:'Владелец ресторана', courier:'Курьер', admin:'Администратор' };
let mode = 'login';

function setMode(m){
  mode = m;
  $('tab-login').setAttribute('aria-selected', m === 'login');
  $('tab-reg').setAttribute('aria-selected', m === 'register');
  $('reg-only').hidden = m === 'login';
  $('auth-submit').textContent = m === 'login' ? 'Войти' : 'Зарегистрироваться';
  $('auth-title').textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
  $('auth-sub').textContent = m === 'login' ? 'Войдите, чтобы заказать любимую еду' : 'Заполните данные, чтобы начать';
  $('switch-mode').textContent = m === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт';
  $('f-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  say('auth-msg', '');
}

// Экраны: auth — вход, shell — профиль покупателя, owner — кабинет ресторана
function showScreen(name){
  $('auth').hidden = name !== 'auth';
  $('shell').hidden = name !== 'shell';
  $('owner').hidden = name !== 'owner';
  $('courier').hidden = name !== 'courier';
}

function logout(){
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  session.setToken(null);
  user = null; resetOwner(); resetCart(); resetCourier(); stopNotifications();
  history.replaceState(null, '', location.pathname);
  showScreen('auth'); say('auth-msg', '');
}

async function onAuth(){
  const btn = $('auth-submit');
  const email = $('f-email').value.trim(), password = $('f-pass').value;
  if (!email || !password) return say('auth-msg', 'Введите email и пароль', 'err');
  busy(btn, true); say('auth-msg', '');
  try {
    let res;
    if (mode === 'login') {
      res = await Api.login({ email, password });
    } else {
      const name = $('f-name').value.trim();
      if (!name) { busy(btn,false); return say('auth-msg', 'Введите имя', 'err'); }
      if (password.length < 8) { busy(btn,false); return say('auth-msg', 'Пароль — минимум 8 символов', 'err'); }
      const payload = { email, password, name, role: $('f-role').value };
      const phone = $('f-phone').value.trim(); if (phone) payload.phone = phone;
      res = await Api.register(payload);
    }
    session.setToken(res.token);
    $('f-pass').value = '';
    await enterApp(res);
  } catch (e) {
    say('auth-msg', e.status === 409 ? 'Этот email уже занят' : e.status === 401 ? 'Неверный email или пароль' : e.message, 'err');
  } finally { busy(btn, false); }
}

/* ===================== профиль ===================== */
const TABS = ['personal', 'addresses', 'orders'];
let user = null;
let addresses = [];
let editing = null;   // адрес, который сейчас редактируется в диалоге (null — новый)

const ICON_HOME = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';
const ICON_PIN  = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>';
const ICON_EDIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>';

const isOwner = () => user?.role === 'restaurant_owner';
const isCustomer = () => user?.role === 'customer';
const isCourier = () => user?.role === 'courier';

function route(){
  if (!user) return;
  const m = location.hash.match(/^#\/(profile|owner|restaurants|cart|checkout|orders)(?:\/([\w-]+))?/);
  if (!(m?.[1] === 'orders' && m[2])) leaveOrder();
  // владелец по умолчанию попадает в кабинет, остальные — в каталог ресторанов
  if (/^#\/courier/.test(location.hash) && isCourier()) { showScreen('courier'); openCourier(user); return; }
  if (!m && isCourier()) { location.replace('#/courier'); return; }
  const area = m ? m[1] : isOwner() ? 'owner' : 'restaurants';
  if (area === 'owner' && isOwner()) {
    showScreen('owner');
    openOwner(user, m?.[2] || 'overview');
    return;
  }
  showScreen('shell');
  if (area === 'cart' && isCustomer()) { openCart(); return; }
  if (area === 'checkout' && isCustomer()) { openCheckout(); return; }
  if (area === 'orders' && m?.[2] && isCustomer()) { openOrder(m[2]); return; }
  if (area === 'orders') { location.replace('#/profile/orders'); return; }
  if (area === 'restaurants' || area === 'cart' || area === 'checkout') {
    if (m?.[2]) openRestaurant(m[2]); else openCatalog();
    return;
  }
  showPage('profile');
  const tab = m && m[1] === 'profile' && TABS.includes(m[2]) ? m[2] : 'addresses';
  document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== tab; });
  if (tab === 'orders' && isCustomer()) loadOrderHistory();
  document.querySelectorAll('#p-nav a[data-tab]').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// Профиль из ответа логина запоминаем: если /users/me недоступен для роли (сейчас так у курьера),
// берём роль и id из токена, а имя — отсюда
function rememberUser(u){
  if (u?.id) store.set('pass_user', JSON.stringify({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role }));
}

function userFromToken(){
  try {
    const part = session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(decodeURIComponent(escape(atob(part))));
    const cached = JSON.parse(store.get('pass_user') || 'null');
    const id = claims.UserID, role = claims.RoleUser;
    if (!id || !role) return null;
    return cached?.id === id ? { ...cached, role } : { id, role, name: '', email: '' };
  } catch { return null; }
}

function fillUser(u){
  user = u;
  rememberUser(u);
  $('side-name').textContent = u.name || u.email || '';
  $('side-role').textContent = roleNames[u.role] || u.role || '';
  $('side-avatar').textContent = $('top-avatar').textContent = initials(u.name);
  $('p-name').value = u.name || ''; $('p-email').value = u.email || ''; $('p-phone').value = u.phone || '';
  $('nav-owner').hidden = !isOwner() && !isCourier();
  $('nav-owner').textContent = isCourier() ? 'Мои доставки' : 'Кабинет ресторана';
  $('nav-owner').href = isCourier() ? '#/courier' : '#/owner/overview';
}

async function enterApp(authRes){
  if (authRes) fillUser(authRes);
  try { fillUser(await Api.me()); }
  catch (e) {
    if (!session.token) return;          // 401 — уже разлогинили
    const fromToken = !user && (e.status === 403 || /forbidden/.test(e.body?.error || '')) ? userFromToken() : null;
    if (fromToken) fillUser(fromToken);
    else if (!user) { logout(); return say('auth-msg', errText(e), 'err'); }
    else if (!isCourier()) say('profile-msg', errText(e), 'err');
  }
  startNotifications(user?.role);
  setCanOrder(isCustomer(), user?.role);
  $('cart-btn').hidden = !isCustomer();
  if (isCustomer()) await loadCart();
  route();
  if (!isCourier()) loadAddresses();     // адреса курьеру бэк не отдаёт
}

async function savePersonal(ev){
  ev.preventDefault();
  if (!user) return;
  const name = $('p-name').value.trim(), email = $('p-email').value.trim(), phone = $('p-phone').value.trim();
  if (name.length < 2) return say('profile-msg', 'Имя — минимум 2 символа', 'err');
  if (!email.includes('@')) return say('profile-msg', 'Проверьте email', 'err');
  // PATCH: отправляем только то, что поменялось
  const body = {};
  if (name !== (user.name || '')) body.name = name;
  if (email !== (user.email || '')) body.email = email;
  if (phone !== (user.phone || '')) body.phone = phone;
  if (!Object.keys(body).length) return say('profile-msg', 'Нет изменений');
  const btn = $('profile-save'); busy(btn, true); say('profile-msg', '');
  try {
    fillUser(await Api.updateMe(body));
    say('profile-msg', 'Сохранено', 'ok');
  } catch (e) {
    say('profile-msg', e.status === 409 ? 'Этот email уже занят' : errText(e), 'err');
  } finally { busy(btn, false); }
}

/* ---------- адреса ---------- */
const streetLine = (a) => [a.street, a.house].filter(Boolean).join(', ');
const subLine = (a) => [a.city, a.apartment ? 'кв. ' + a.apartment : null, a.comment].filter(Boolean).join(' · ');

function renderChip(){
  const def = addresses.find(a => a.is_default) || addresses[0];
  $('addr-chip-text').textContent = def ? [def.city, streetLine(def)].join(', ') : 'Добавьте адрес';
}

function renderAddresses(){
  const box = $('addr-list'); box.textContent = '';
  renderChip();
  if (!addresses.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Адресов пока нет. Добавьте первый, чтобы курьер знал, куда ехать.';
    box.append(p); return;
  }
  const list = [...addresses].sort((a, b) => b.is_default - a.is_default);
  for (const a of list) {
    const card = document.createElement('div');
    card.className = 'addr-card' + (a.is_default ? ' addr-card--default' : '');

    const icon = document.createElement('span'); icon.className = 'addr-card__icon';
    icon.innerHTML = a.is_default ? ICON_HOME : ICON_PIN;

    const body = document.createElement('div'); body.className = 'addr-card__body';
    const title = document.createElement('div'); title.className = 'addr-card__title'; title.textContent = streetLine(a);
    const sub = document.createElement('div'); sub.className = 'addr-card__sub'; sub.textContent = subLine(a);
    body.append(title, sub);

    card.append(icon, body);
    if (a.is_default) {
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'По умолчанию';
      card.append(badge);
    }
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'icon-btn'; edit.innerHTML = ICON_EDIT;
    edit.setAttribute('aria-label', 'Изменить адрес ' + streetLine(a));
    edit.onclick = () => openAddr(a);
    card.append(edit);

    box.append(card);
  }
}

async function loadAddresses(){
  say('addr-msg', '');
  try { addresses = (await Api.addresses()) || []; renderAddresses(); }
  catch (e) { $('addr-list').textContent = ''; say('addr-msg', errText(e), 'err'); }
}

function openAddr(a){
  editing = a || null;
  $('addr-form-title').textContent = a ? 'Изменить адрес' : 'Новый адрес';
  $('a-city').value = a?.city || ''; $('a-street').value = a?.street || ''; $('a-house').value = a?.house || '';
  $('a-apt').value = a?.apartment || ''; $('a-comment').value = a?.comment || '';
  $('a-default').checked = a ? !!a.is_default : !addresses.length;
  $('addr-delete').hidden = !a;
  say('addr-form-msg', '');
  $('addr-dialog').showModal();
  $('a-city').focus();
}

function closeAddr(){ $('addr-dialog').close(); editing = null; }

async function saveAddress(ev){
  ev.preventDefault();
  const v = {
    city: $('a-city').value.trim(), street: $('a-street').value.trim(), house: $('a-house').value.trim(),
    apartment: $('a-apt').value.trim() || null, comment: $('a-comment').value.trim() || null,
    is_default: $('a-default').checked,
  };
  if (!v.city || !v.street || !v.house) return say('addr-form-msg', 'Заполните город, улицу и дом', 'err');

  let body;
  if (editing) {
    // PATCH: только изменённые поля; очищенное необязательное поле уходит как null
    body = {};
    for (const k of Object.keys(v)) if (v[k] !== (editing[k] ?? (k === 'is_default' ? false : null))) body[k] = v[k];
    if (!Object.keys(body).length) return closeAddr();
  } else {
    body = { city: v.city, street: v.street, house: v.house, is_default: v.is_default };
    if (v.apartment) body.apartment = v.apartment;
    if (v.comment) body.comment = v.comment;
  }

  const wasEditing = !!editing;
  const btn = $('addr-save'); busy(btn, true); say('addr-form-msg', '');
  try {
    if (wasEditing) await Api.updateAddress(editing.id, body); else await Api.addAddress(body);
    closeAddr();
    say('addr-msg', wasEditing ? 'Адрес обновлён' : 'Адрес добавлен', 'ok');
    loadAddresses();
  } catch (e) {
    if (wasEditing && e.status === 404) {
      closeAddr(); loadAddresses();
      say('addr-msg', 'Адрес не найден — возможно, его уже удалили', 'err');
    } else say('addr-form-msg', errText(e), 'err');
  } finally { busy(btn, false); }
}

async function deleteAddress(){
  if (!editing || !confirm('Удалить адрес «' + streetLine(editing) + '»?')) return;
  const btn = $('addr-delete'); busy(btn, true);
  try {
    await Api.delAddress(editing.id);
    closeAddr();
    say('addr-msg', 'Адрес удалён', 'ok');
    loadAddresses();
  } catch (e) {
    say('addr-form-msg', e.status === 404 ? 'Адрес уже удалён' : errText(e), 'err');
  } finally { busy(btn, false); }
}

/* ===================== init ===================== */
session.onUnauthorized = logout;
$('tab-login').onclick = () => setMode('login');
$('tab-reg').onclick = () => setMode('register');
$('switch-mode').onclick = () => setMode(mode === 'login' ? 'register' : 'login');
$('toggle-pass').onclick = () => {
  const p = $('f-pass'), show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('toggle-pass').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
};
$('auth-submit').onclick = onAuth;
$('f-pass').addEventListener('keydown', e => { if (e.key === 'Enter') onAuth(); });

$('logout').onclick = logout;
$('o-logout').onclick = logout;
$('k-logout').onclick = logout;
$('personal-form').onsubmit = savePersonal;
$('addr-chip').onclick = () => { location.hash = '#/profile/addresses'; };
$('search').addEventListener('input', (e) => {
  setQuery(e.target.value);
  if (location.hash !== '#/restaurants') location.hash = '#/restaurants';
});
$('addr-new').onclick = () => openAddr(null);
$('addr-form').onsubmit = saveAddress;
$('addr-cancel').onclick = closeAddr;
$('addr-delete').onclick = deleteAddress;
$('addr-dialog').addEventListener('close', () => { editing = null; });
window.addEventListener('hashchange', route);

if (session.token) enterApp(); else showScreen('auth');
