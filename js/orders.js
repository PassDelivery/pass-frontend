/* PassDelivery — заказы покупателя: оформление (макет 05-checkout), заказ и его статус (06-tracking),
   история в профиле (08-order-history) */
import { Api } from './api.js';
import { $, say, busy, errText, price, placeholderBg, showPage } from './ui.js';
import { getCart, loadCart } from './cart.js';
import { reviewCard } from './reviews.js';

export const STATUS = {
  new:        { label: 'Новый',      title: 'Ждём подтверждения ресторана', icon: '⏳' },
  accepted:   { label: 'Принят',     title: 'Ресторан принял заказ',        icon: '✓' },
  cooking:    { label: 'Готовится',  title: 'Готовим ваш заказ',            icon: '🍳' },
  ready:      { label: 'Готов',      title: 'Заказ готов, ищем курьера',    icon: '📦' },
  delivering: { label: 'В пути',     title: 'Курьер уже в пути',            icon: '➜' },
  delivered:  { label: 'Доставлен',  title: 'Заказ доставлен',              icon: '✓' },
  cancelled:  { label: 'Отменён',    title: 'Заказ отменён',                icon: '✕' },
  rejected:   { label: 'Отклонён',   title: 'Ресторан отклонил заказ',      icon: '✕' },
};
const FLOW = ['new', 'accepted', 'cooking', 'ready', 'delivering', 'delivered'];

const orderNo = (id) => 'PD-' + String(id).slice(0, 6).toUpperCase();
const dateTime = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const dateOnly = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const dishesWord = (n) => n % 10 === 1 && n % 100 !== 11 ? 'блюдо' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'блюда' : 'блюд';

function orderError(e){
  if (e.status === 404 && !e.body) return 'Заказы пока недоступны: на сервере нет ручек /orders';
  const text = e.body?.error || '';
  if (text.includes('cart is empty')) return 'Корзина пуста — добавьте блюда из меню';
  if (text.includes('restaurant is closed')) return 'Ресторан сейчас закрыт и не принимает заказы';
  if (text.includes('is not available')) return 'Одно из блюд закончилось — уберите его из корзины';
  if (text.includes('address not found')) return 'Адрес не найден — выберите другой';
  if (text.includes('cant cancel')) return 'Заказ уже принят рестораном — отменить его нельзя';
  if (e.status === 404) return 'Заказ не найден';
  return errText(e);
}

/* ---------- оформление ---------- */
let addresses = [];
let chosenAddr = null;

export async function openCheckout(){
  showPage('checkout');
  say('co-msg', '');
  $('co-form').hidden = true;
  try {
    const [, addrs] = await Promise.all([loadCart(), Api.addresses()]);
    addresses = addrs || [];
  } catch (e) { return say('co-msg', errText(e), 'err'); }

  const cart = getCart();
  if (!cart || !cart.items.length) { location.hash = '#/cart'; return; }

  if (!addresses.some(a => a.id === chosenAddr)) chosenAddr = (addresses.find(a => a.is_default) || addresses[0])?.id || null;
  renderAddresses();
  renderSummary(cart);
  $('co-form').hidden = false;
}

function renderAddresses(){
  const box = $('co-addrs'); box.textContent = '';
  if (!addresses.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Сохранённых адресов нет — добавьте адрес в профиле, и он появится здесь.';
    box.append(p);
  }
  for (const a of addresses) {
    const label = document.createElement('label'); label.className = 'co-addr';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'co-addr'; radio.value = a.id;
    radio.checked = a.id === chosenAddr;
    radio.onchange = () => { chosenAddr = a.id; };
    const text = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = [a.street, a.house].filter(Boolean).join(', ');
    const sub = document.createElement('small'); sub.textContent = [a.city, a.apartment ? 'кв. ' + a.apartment : null, a.is_default ? 'по умолчанию' : null].filter(Boolean).join(' · ');
    text.append(title, sub);
    label.append(radio, text);
    box.append(label);
  }
  $('co-submit').disabled = !addresses.length;
}

function renderSummary(cart){
  $('co-rest').textContent = cart.restaurant_name || 'Ваш заказ';
  const box = $('co-items'); box.textContent = '';
  for (const i of cart.items) {
    const row = document.createElement('div'); row.className = 'co-item' + (i.is_available ? '' : ' co-item--off');
    const name = document.createElement('div');
    const n = document.createElement('strong'); n.textContent = i.name;
    const q = document.createElement('small'); q.textContent = i.quantity + ' × ' + price(i.price_kopecks) + (i.is_available ? '' : ' · нет в наличии');
    name.append(n, q);
    const sum = document.createElement('span'); sum.textContent = price(i.total_kopecks);
    row.append(name, sum);
    box.append(row);
  }
  $('co-goods').textContent = price(cart.total_kopecks);
  $('co-total').textContent = price(cart.total_kopecks);
  if (cart.items.some(i => !i.is_available)) say('co-msg', 'В корзине есть блюда, которых нет в наличии — уберите их перед оформлением', 'err');
}

async function submitCheckout(ev){
  ev.preventDefault();
  if (!chosenAddr) return say('co-msg', 'Выберите адрес доставки', 'err');
  const comment = $('co-comment').value.trim();
  const body = { address_id: chosenAddr };
  if (comment) body.comment = comment;

  const btn = $('co-submit'); busy(btn, true); say('co-msg', '');
  try {
    const order = await Api.createOrder(body);
    $('co-comment').value = '';
    await loadCart();                       // бэк очистил корзину — обновим счётчик в шапке
    location.hash = '#/orders/' + order.id;
  } catch (e) {
    say('co-msg', orderError(e), 'err');
  } finally { busy(btn, false); }
}

/* ---------- заказ ---------- */
let openedOrder = null;
let poll = null;

export function leaveOrder(){ clearInterval(poll); poll = null; openedOrder = null; }

export async function openOrder(id){
  showPage('order');
  if (openedOrder !== id) { $('ord-body').hidden = true; $('ord-title').textContent = 'Заказ ' + orderNo(id); }
  openedOrder = id;
  say('ord-msg', '');
  await refreshOrder(id);
  clearInterval(poll);
  // ресторан двигает статус у себя — подтягиваем изменения, пока страница открыта
  poll = setInterval(() => { if (openedOrder === id && !document.hidden) refreshOrder(id, true); }, 15000);
}

async function refreshOrder(id, quiet){
  try {
    const [order, history] = await Promise.all([Api.order(id), Api.orderHistory(id)]);
    if (openedOrder !== id) return;
    renderOrder(order, history);
    if (['delivered', 'cancelled', 'rejected'].includes(order.status)) { clearInterval(poll); poll = null; }
  } catch (e) {
    if (!quiet && openedOrder === id) say('ord-msg', orderError(e), 'err');
  }
}

function renderOrder(o, history){
  const st = STATUS[o.status] || { label: o.status, title: o.status, icon: '•' };
  const failed = o.status === 'cancelled' || o.status === 'rejected';
  $('ord-title').textContent = 'Заказ №' + orderNo(o.id);
  $('ord-icon').textContent = st.icon;
  $('ord-icon').classList.toggle('ord-status__icon--bad', failed);
  $('ord-state').textContent = st.title;
  $('ord-sub').textContent = 'Оформлен ' + dateTime(o.created_at) + (o.updated_at !== o.created_at ? ' · обновлён ' + dateTime(o.updated_at) : '');

  const steps = $('ord-steps'); steps.textContent = '';
  steps.hidden = failed;
  const reached = FLOW.indexOf(o.status);
  FLOW.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'step' + (i < reached ? ' step--done' : i === reached ? ' step--now' : '');
    const dot = document.createElement('span'); dot.className = 'step__dot'; dot.textContent = i <= reached ? '✓' : '';
    const label = document.createElement('span'); label.className = 'step__label'; label.textContent = STATUS[s].label;
    li.append(dot, label);
    steps.append(li);
  });

  const items = $('ord-items'); items.textContent = '';
  for (const i of o.items) {
    const row = document.createElement('div'); row.className = 'co-item';
    const thumb = document.createElement('span'); thumb.className = 'ord-thumb'; thumb.style.background = placeholderBg(i.dish_id);
    thumb.textContent = (i.dish_name || '·')[0].toUpperCase(); thumb.setAttribute('aria-hidden', 'true');
    const name = document.createElement('div');
    const n = document.createElement('strong'); n.textContent = i.dish_name;
    const q = document.createElement('small'); q.textContent = i.quantity + ' × ' + price(i.price_at_order_time);
    name.append(n, q);
    const sum = document.createElement('span'); sum.textContent = price(i.quantity * i.price_at_order_time);
    row.append(thumb, name, sum);
    items.append(row);
  }

  const hist = $('ord-history'); hist.textContent = '';
  for (const h of history) {
    const li = document.createElement('li');
    const s = document.createElement('strong'); s.textContent = STATUS[h.status]?.label || h.status;
    const t = document.createElement('span'); t.textContent = dateTime(h.changed_at);
    li.append(s, t);
    hist.append(li);
  }

  const facts = $('ord-facts'); facts.textContent = '';
  const fact = (k, v) => {
    if (!v) return;
    const d = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    d.append(dt, dd); facts.append(d);
  };
  fact('Ресторан', o.restaurant_name);
  fact('Номер заказа', orderNo(o.id));
  fact('Сумма заказа', price(o.total_kopecks));
  fact('Адрес доставки', o.delivery_address);
  fact('Комментарий', o.comment);
  fact('Статус', st.label);

  $('ord-cancel').hidden = o.status !== 'new';
  $('ord-body').hidden = false;
  if (o.status === 'delivered') loadOrderReview(o); else $('ord-review').hidden = true;
}

/* ---------- отзыв о доставленном заказе ---------- */
let rvOrder = null;
let rvRating = 0;
let rvCourier = 0;

// Есть ли уже отзыв — узнаём из публичного списка отзывов ресторана (в нём есть order_id)
async function loadOrderReview(o){
  if (rvOrder?.id === o.id && !$('ord-review').hidden) return;   // форму, которую сейчас заполняют, не сбрасываем
  rvOrder = o;
  let mine = null;
  try { mine = ((await Api.restaurantReviews(o.restaurant_id)) || []).find(r => r.order_id === o.id) || null; }
  catch { $('ord-review').hidden = true; return; }
  if (openedOrder !== o.id) return;
  showReviewState(mine);
  $('ord-review').hidden = false;
}

function showReviewState(review){
  $('rv-form').hidden = !!review;
  $('rv-done').hidden = !review;
  if (review) {
    const box = $('rv-done'); box.textContent = '';
    const h = document.createElement('h2'); h.textContent = 'Спасибо за отзыв!';
    box.append(h, reviewCard(review));
    return;
  }
  rvRating = 0; rvCourier = 0; $('rv-body').value = ''; say('rv-msg', '');
  renderStarsInput();
}

function renderStarsInput(){
  starsInput('rv-stars', rvRating, (n) => { rvRating = n; });
  starsInput('rv-cstars', rvCourier, (n) => { rvCourier = rvCourier === n ? 0 : n; });   // повторный клик снимает необязательную оценку
}

function starsInput(id, value, set){
  const box = $(id); box.textContent = '';
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rv-star' + (n <= value ? ' rv-star--on' : '');
    b.textContent = '★'; b.role = 'radio';
    b.setAttribute('aria-checked', String(n === value));
    b.setAttribute('aria-label', n + ' из 5');
    b.onclick = () => { set(n); renderStarsInput(); };
    box.append(b);
  }
}

async function submitReview(ev){
  ev.preventDefault();
  if (!rvOrder) return;
  if (!rvRating) return say('rv-msg', 'Оцените еду и ресторан от 1 до 5 звёзд', 'err');
  const body = { rating: rvRating };
  if (rvCourier) body.courier_rating = rvCourier;
  const text = $('rv-body').value.trim();
  if (text) body.body = text;
  const btn = $('rv-submit'); busy(btn, true); say('rv-msg', '');
  try {
    showReviewState(await Api.createReview(rvOrder.id, body));
  } catch (e) {
    if (e.status === 409 && (e.body?.error || '').includes('already exists')) { rvOrder = null; return refreshOrder(openedOrder); }
    say('rv-msg', e.status === 404 && !e.body ? 'Отзывы пока недоступны: на сервере нет ручки /orders/{id}/review' : errText(e), 'err');
  } finally { busy(btn, false); }
}

async function cancelOpened(){
  const id = openedOrder;
  if (!id || !confirm('Отменить заказ? Это действие нельзя вернуть.')) return;
  const btn = $('ord-cancel'); busy(btn, true); say('ord-msg', '');
  try {
    await Api.cancelOrder(id);
    await refreshOrder(id);
  } catch (e) {
    say('ord-msg', orderError(e), 'err');
    refreshOrder(id, true);
  } finally { busy(btn, false); }
}

/* ---------- история в профиле ---------- */
export async function loadOrderHistory(){
  say('hist-msg', '');
  let orders;
  try { orders = (await Api.orders()) || []; }
  catch (e) { $('hist-list').textContent = ''; $('hist-empty').hidden = true; return say('hist-msg', orderError(e), 'err'); }

  const box = $('hist-list'); box.textContent = '';
  for (const o of orders) {
    const a = document.createElement('a'); a.className = 'hist-card'; a.href = '#/orders/' + o.id;
    const thumb = document.createElement('span'); thumb.className = 'ord-thumb ord-thumb--lg';
    thumb.style.background = placeholderBg(o.restaurant_id);
    thumb.textContent = (o.restaurant_name || '·')[0].toUpperCase(); thumb.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div'); info.className = 'hist-card__info';
    const n = document.createElement('strong'); n.textContent = o.restaurant_name || 'Ресторан';
    const count = o.items.reduce((s, i) => s + i.quantity, 0);
    const sub = document.createElement('small'); sub.textContent = dateOnly(o.created_at) + ' · ' + count + ' ' + dishesWord(count);
    info.append(n, sub);
    const side = document.createElement('div'); side.className = 'hist-card__side';
    const sum = document.createElement('strong'); sum.textContent = price(o.total_kopecks);
    const st = document.createElement('span');
    st.className = 'status' + (['cancelled', 'rejected'].includes(o.status) ? ' status--off' : o.status === 'delivered' ? '' : ' status--live');
    st.textContent = STATUS[o.status]?.label || o.status;
    side.append(sum, st);
    if (o.status === 'delivered') { const rate = document.createElement('span'); rate.className = 'hist-rate'; rate.dataset.order = o.id; rate.hidden = true; rate.textContent = '★ Оценить'; side.append(rate); }
    a.append(thumb, info, side);
    box.append(a);
  }
  $('hist-empty').hidden = orders.length > 0;
  markUnrated(orders);
}

// Для доставленных заказов без отзыва показываем «★ Оценить» — по одному запросу на ресторан
async function markUnrated(orders){
  const delivered = orders.filter(o => o.status === 'delivered');
  const rests = [...new Set(delivered.map(o => o.restaurant_id))];
  const reviewed = new Set();
  await Promise.all(rests.map(async (rid) => {
    try { for (const r of (await Api.restaurantReviews(rid)) || []) reviewed.add(r.order_id); }
    catch { delivered.filter(o => o.restaurant_id === rid).forEach(o => reviewed.add(o.id)); }   // не узнали — не дёргаем пользователя
  }));
  for (const o of delivered) {
    const el = document.querySelector('.hist-rate[data-order="' + o.id + '"]');
    if (el) el.hidden = reviewed.has(o.id);
  }
}

$('co-form').onsubmit = submitCheckout;
$('ord-cancel').onclick = cancelOpened;
$('rv-form').onsubmit = submitReview;
