/* PassDelivery — кабинет курьера (макет 10-courier, node 37:1941)
   Предложения подбирает бэк при каждом GET /courier/deliveries, поэтому список периодически перезапрашиваем */
import { Api } from './api.js';
import { $, say, busy, errText, initials, price } from './ui.js';

let me = null;
let status = 'offline';
let deliveries = [];
let poll = null;

const no = (id) => 'PD-' + String(id).slice(0, 6).toUpperCase();

export function resetCourier(){ stop(); me = null; status = 'offline'; deliveries = []; }
function stop(){ clearInterval(poll); poll = null; }

export async function openCourier(user){
  me = user;
  $('k-name').textContent = user.name || user.email;
  $('k-avatar').textContent = initials(user.name);
  $('k-hello').textContent = greeting() + ', ' + (user.name || '').split(' ')[0];
  say('k-msg', '');
  try { status = (await Api.courierStatus()).status; }
  catch (e) { say('k-msg', courierError(e), 'err'); }
  await load();
  stop();
  poll = setInterval(() => { if (!document.hidden && !$('courier').hidden) load(true); }, 15000);
}

function greeting(){
  const h = new Date().getHours();
  return h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

async function load(quiet){
  try {
    deliveries = (await Api.courierDeliveries()) || [];
    if (deliveries.some(d => d.status !== 'offered')) status = 'busy';
    else if (status === 'busy') status = 'free';
    render();
  } catch (e) {
    if (!quiet) say('k-msg', courierError(e), 'err');
  }
}

function courierError(e){
  if (e.status === 404 && !e.body) return 'Раздел курьера пока недоступен: на сервере нет ручек /courier';
  const text = e.body?.error || '';
  if (text.includes('active delivery')) return 'Сначала завершите текущую доставку';
  if (text.includes('taken by another courier') || text.includes('delivery not found')) return 'Этот заказ уже забрал другой курьер';
  if (text.includes('order is still')) return 'Ресторан ещё готовит заказ — заберите его, когда он будет готов';
  if (text.includes('order is')) return 'Заказ больше недоступен для доставки';
  if (e.status === 409) return 'Статус уже изменился — список обновлён';
  return errText(e);
}

/* ---------- отрисовка ---------- */
function render(){
  const online = status !== 'offline';
  $('k-switch').setAttribute('aria-checked', String(online));
  $('k-switch').disabled = status === 'busy';
  $('k-switch').title = status === 'busy' ? 'Нельзя уйти с линии во время доставки' : '';
  $('k-status').textContent = status === 'busy' ? 'На доставке' : online ? 'Онлайн' : 'Не на линии';
  $('k-dot').classList.toggle('dot--on', online);

  const active = deliveries.find(d => d.status === 'accepted' || d.status === 'picked_up');
  const offers = deliveries.filter(d => d.status === 'offered');

  $('k-sub').textContent = active ? 'У вас активная доставка'
    : online ? 'Готовы к новым доставкам?' : 'Включите «На линии», чтобы получать заказы';

  const box = $('k-active');
  box.hidden = !active;
  box.textContent = '';
  if (active) box.append(...activeCard(active));

  $('k-offers-box').hidden = !!active || !offers.length;
  const list = $('k-offers'); list.textContent = '';
  for (const d of offers) list.append(offerRow(d));

  const empty = !active && !offers.length;
  $('k-empty').hidden = !empty;
  $('k-empty-text').textContent = online
    ? 'Свободных заказов пока нет — новые появятся здесь сами, когда рестораны их приготовят'
    : 'Вы не на линии. Включите приём заказов в боковом меню.';
}

function itemsText(d){
  return d.items.map(i => i.quantity + ' × ' + i.dish_name).join(', ');
}

function offerRow(d){
  const row = document.createElement('article'); row.className = 'panel k-offer';

  const id = document.createElement('div'); id.className = 'k-offer__no';
  const num = document.createElement('strong'); num.textContent = '#' + no(d.order_id);
  const stage = document.createElement('span');
  stage.className = 'oo-badge oo-badge--' + (d.order_status === 'ready' ? 'ready' : 'cooking');
  stage.textContent = d.order_status === 'ready' ? 'Готов к выдаче' : 'Готовится';
  id.append(num, stage);
  const route = document.createElement('div'); route.className = 'k-offer__route';
  const from = document.createElement('div'); from.innerHTML = '<span>Забрать</span>';
  from.append(d.restaurant_name + ' · ' + d.restaurant_address);
  const to = document.createElement('div'); to.innerHTML = '<span>Доставить</span>';
  to.append(d.delivery_address);
  const what = document.createElement('small'); what.textContent = itemsText(d);
  route.append(from, to, what);

  const sum = document.createElement('strong'); sum.className = 'k-offer__sum'; sum.textContent = price(d.total_kopecks);

  const acts = document.createElement('div'); acts.className = 'k-offer__acts';
  const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'primary'; accept.textContent = 'Принять';
  accept.onclick = () => act(row, () => Api.acceptDelivery(d.id));
  const refuse = document.createElement('button'); refuse.type = 'button'; refuse.className = 'oo-reject'; refuse.textContent = 'Отказаться';
  refuse.onclick = () => act(row, () => Api.refuseDelivery(d.id));
  acts.append(accept, refuse);

  row.append(id, route, sum, acts);
  return row;
}

function activeCard(d){
  const picked = d.status === 'picked_up';
  const cooking = !picked && d.order_status !== 'ready';

  const head = document.createElement('div'); head.className = 'k-active__head';
  const title = document.createElement('div');
  const t = document.createElement('div'); t.className = 'k-active__title'; t.textContent = picked ? 'Везёте заказ покупателю' : cooking ? 'Ресторан ещё готовит заказ' : 'Заберите заказ в ресторане';
  const n = document.createElement('div'); n.className = 'ohead__sub'; n.textContent = 'Заказ #' + no(d.order_id) + ' · ' + price(d.total_kopecks);
  title.append(t, n);
  const badge = document.createElement('span'); badge.className = 'oo-badge oo-badge--' + (picked ? 'cooking' : 'new');
  badge.className = 'oo-badge oo-badge--' + (picked ? 'cooking' : cooking ? 'accepted' : 'ready');
  badge.textContent = picked ? 'В пути' : cooking ? 'Готовится' : 'Готов к выдаче';
  head.append(title, badge);

  const steps = document.createElement('div'); steps.className = 'k-points';
  const point = (label, main, sub, now) => {
    const p = document.createElement('div'); p.className = 'k-point' + (now ? ' k-point--now' : '');
    const l = document.createElement('span'); l.textContent = label;
    const m = document.createElement('strong'); m.textContent = main;
    p.append(l, m);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; p.append(s); }
    return p;
  };
  steps.append(
    point('Ресторан', d.restaurant_name, d.restaurant_address, !picked),
    point('Покупатель', d.delivery_address, [d.customer_name, d.comment].filter(Boolean).join(' · '), picked),
  );

  const what = document.createElement('p'); what.className = 'k-active__items'; what.textContent = itemsText(d);

  const foot = document.createElement('div'); foot.className = 'k-active__foot';
  if (d.customer_phone) {
    const call = document.createElement('a'); call.className = 'btn-outline btn-outline--sm'; call.href = 'tel:' + d.customer_phone;
    call.textContent = '☎ ' + d.customer_phone;
    foot.append(call);
  }
  const next = document.createElement('button'); next.type = 'button'; next.className = 'primary';
  next.textContent = picked ? 'Доставил' : cooking ? 'Ждём готовности' : 'Забрал заказ';
  next.disabled = cooking;
  if (cooking) next.title = 'Кнопка станет активной, когда ресторан отметит заказ готовым';
  const card = { querySelectorAll: (sel) => foot.querySelectorAll(sel) };
  next.onclick = () => act(card, () => Api.setDeliveryStatus(d.id, picked ? 'delivered' : 'picked_up'), picked ? 'Заказ доставлен — отличная работа!' : '');
  foot.append(next);

  return [head, steps, what, foot];
}

async function act(scope, fn, okText){
  scope.querySelectorAll('button').forEach(b => busy(b, true)); say('k-msg', '');
  try {
    await fn();
    await load();
    if (okText) say('k-msg', okText, 'ok');
  } catch (e) {
    say('k-msg', courierError(e), 'err');
    await load(true);
  }
}

async function toggleOnline(){
  const want = status === 'offline' ? 'free' : 'offline';
  const sw = $('k-switch'); busy(sw, true); say('k-msg', '');
  try {
    status = (await Api.setCourierStatus(want)).status;
    await load();
  } catch (e) { say('k-msg', courierError(e), 'err'); }
  finally { busy(sw, status === 'busy'); }
}

$('k-switch').onclick = toggleOnline;
$('k-refresh').onclick = () => load();
