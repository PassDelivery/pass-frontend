/* PassDelivery — кабинет курьера (макет 10-courier, node 37:1941)
   Предложения подбирает бэк при каждом GET /courier/deliveries, поэтому список периодически перезапрашиваем.
   Вид: #/courier — доставки (вкладки «Доступные» / «Мои заказы»), #/courier/history — история */
import { Api } from './api.js';
import { $, say, busy, errText, initials, price, paintPhoto } from './ui.js';

let me = null;
let status = 'offline';
let deliveries = [];
let history = [];
let poll = null;
let view = 'work';
let tab = 'offers';
let hadActive = false;
let selectedId = null;

const no = (id) => 'PD-' + String(id).slice(0, 6).toUpperCase();
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

export function resetCourier(){
  stop(); me = null; status = 'offline'; deliveries = []; history = [];
  view = 'work'; tab = 'offers'; hadActive = false; selectedId = null;
}
function stop(){ clearInterval(poll); poll = null; }

export async function openCourier(user, next){
  const first = me !== user;
  me = user;
  view = next === 'history' ? 'history' : 'work';
  $('k-name').textContent = user.name || user.email;
  $('k-avatar').textContent = initials(user.name);
  paintPhoto($('k-avatar'), user.avatar_url, null);
  $('k-hello').textContent = greeting() + ', ' + (user.name || '').split(' ')[0];
  showView();
  if (!first) { if (view === 'history') loadStats(); return; }
  say('k-msg', '');
  try { status = (await Api.courierStatus()).status; }
  catch (e) { say('k-msg', courierError(e), 'err'); }
  await Promise.all([load(), loadStats()]);
  stop();
  poll = setInterval(() => { if (!document.hidden && !$('courier').hidden) load(true); }, 15000);
}

function greeting(){
  const h = new Date().getHours();
  return h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

function showView(){
  $('k-work').hidden = view !== 'work';
  $('k-history').hidden = view !== 'history';
  document.querySelectorAll('#k-nav a[data-kview]').forEach(a => {
    if (a.dataset.kview === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
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

// История и рейтинг: карточки сверху и раздел «История»
async function loadStats(){
  const [h, r] = await Promise.allSettled([Api.courierHistory(), Api.courierRating()]);
  if (h.status === 'fulfilled') history = h.value || [];
  renderStats(r.status === 'fulfilled' ? r.value : null);
  renderHistory(h.status === 'fulfilled');
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

/* ---------- карточки статистики ---------- */
function renderStats(rating){
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = history.filter(d => d.delivered_at && new Date(d.delivered_at) >= start);
  $('k-today').textContent = today.length + ' ' + plural(today.length, 'заказ', 'заказа', 'заказов');
  $('k-earned').textContent = price(today.reduce((s, d) => s + (d.payout_kopecks || 0), 0));
  if (rating?.rating != null) {
    $('k-rating').textContent = rating.rating.toFixed(1).replace('.', ',');
    $('k-rating-sub').textContent = rating.count + ' ' + plural(rating.count, 'оценка', 'оценки', 'оценок');
  } else {
    $('k-rating').textContent = '—';
    $('k-rating-sub').textContent = rating ? 'пока нет оценок' : '';
  }
}

/* ---------- доставки ---------- */
function render(){
  const online = status !== 'offline';
  $('k-switch').setAttribute('aria-checked', String(online));
  $('k-switch').disabled = status === 'busy';
  $('k-switch').title = status === 'busy' ? 'Нельзя уйти с линии во время доставки' : '';
  $('k-status').textContent = status === 'busy' ? 'На доставке' : online ? 'Онлайн' : 'Не на линии';
  $('k-dot').classList.toggle('dot--on', online);

  const active = deliveries.find(d => d.status === 'accepted' || d.status === 'picked_up');
  const offers = deliveries.filter(d => d.status === 'offered');

  // появилась активная доставка — показываем её; завершилась — возвращаемся к доступным
  if (active && !hadActive) tab = 'mine';
  if (!active && hadActive) { tab = 'offers'; loadStats(); }
  hadActive = !!active;

  $('k-sub').textContent = active ? 'У вас активная доставка'
    : online ? 'Готовы к новым доставкам?' : 'Включите «На линии», чтобы получать заказы';

  setCount('k-offers-count', offers.length);
  setCount('k-mine-count', active ? 1 : 0);
  document.querySelectorAll('[data-ktab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ktab === tab)));
  $('k-work-title').textContent = tab === 'offers' ? 'Доступные доставки' : 'Мои заказы';

  $('k-pane-offers').hidden = !(tab === 'offers' && offers.length);
  $('k-pane-mine').hidden = !(tab === 'mine' && active);

  if (!offers.some(d => d.id === selectedId)) selectedId = offers[0]?.id || null;
  const list = $('k-offers'); list.textContent = '';
  for (const d of offers) list.append(offerRow(d, !!active));
  renderDetail(offers.find(d => d.id === selectedId), !!active);

  const box = $('k-active'); box.textContent = '';
  if (active) box.append(...activeCard(active));

  $('k-empty').hidden = tab === 'offers' ? offers.length > 0 : !!active;
  $('k-empty-text').textContent = tab === 'mine'
    ? 'Активной доставки нет — примите заказ во вкладке «Доступные»'
    : !online ? 'Вы не на линии. Включите приём заказов в боковом меню.'
    : 'Свободных заказов пока нет — новые появятся здесь сами, когда рестораны начнут их готовить';
}

function setCount(id, n){ $(id).hidden = !n; $(id).textContent = n; }

function itemsText(d){
  return d.items.map(i => i.quantity + ' × ' + i.dish_name).join(', ');
}

function stageBadge(d){
  const b = document.createElement('span');
  b.className = 'oo-badge oo-badge--' + (d.order_status === 'ready' ? 'ready' : 'cooking');
  b.textContent = d.order_status === 'ready' ? 'Готов к выдаче' : 'Готовится';
  return b;
}

function lockAccept(btn, locked){
  btn.disabled = locked;
  if (locked) btn.title = 'Сначала завершите текущую доставку';
}

function offerRow(d, locked){
  const row = document.createElement('div');
  row.className = 'k-row' + (d.id === selectedId ? ' k-row--on' : '');
  row.tabIndex = 0;
  row.setAttribute('aria-label', 'Заказ #' + no(d.order_id) + ', ' + d.restaurant_name);
  const pick = () => { selectedId = d.id; render(); };
  row.onclick = (ev) => { if (!ev.target.closest('button')) pick(); };
  row.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target === row) pick(); };

  const num = document.createElement('strong'); num.className = 'k-row__no'; num.textContent = '#' + no(d.order_id);
  const rest = document.createElement('div'); rest.className = 'k-row__rest';
  const rn = document.createElement('strong'); rn.textContent = d.restaurant_name;
  rest.append(rn, stageBadge(d));
  const addr = document.createElement('span'); addr.className = 'k-row__addr'; addr.textContent = d.delivery_address;
  const pay = document.createElement('strong'); pay.className = 'k-row__pay'; pay.textContent = price(d.payout_kopecks);

  const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'primary'; accept.textContent = 'Принять';
  lockAccept(accept, locked);
  accept.onclick = () => act(row, () => Api.acceptDelivery(d.id));

  row.append(num, rest, addr, pay, accept);
  return row;
}

function renderDetail(d, locked){
  const box = $('k-detail'); box.textContent = '';
  if (!d) return;
  const stage = stageBadge(d);
  const name = document.createElement('h3'); name.className = 'k-detail__name'; name.textContent = d.restaurant_name;
  const raddr = document.createElement('p'); raddr.className = 'k-detail__addr'; raddr.textContent = d.restaurant_address;

  const facts = document.createElement('dl'); facts.className = 'k-detail__facts';
  const fact = (k, v) => {
    if (!v) return;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    facts.append(dt, dd);
  };
  fact('Заказ', '#' + no(d.order_id));
  fact('Доставить', d.delivery_address);
  fact('Состав', itemsText(d));
  fact('Комментарий', d.comment);
  fact('Сумма заказа', price(d.total_kopecks));

  const pay = document.createElement('p'); pay.className = 'k-detail__pay'; pay.textContent = 'Оплата ' + price(d.payout_kopecks);

  const acts = document.createElement('div'); acts.className = 'k-detail__acts';
  const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'primary'; accept.textContent = 'Принять доставку';
  lockAccept(accept, locked);
  accept.onclick = () => act(acts, () => Api.acceptDelivery(d.id));
  const refuse = document.createElement('button'); refuse.type = 'button'; refuse.className = 'link'; refuse.textContent = 'Отказаться';
  refuse.onclick = () => act(acts, () => Api.refuseDelivery(d.id));
  acts.append(accept, refuse);

  box.append(stage, name, raddr, facts, pay, acts);
}

function activeCard(d){
  const picked = d.status === 'picked_up';
  const cooking = !picked && d.order_status !== 'ready';

  const head = document.createElement('div'); head.className = 'k-active__head';
  const title = document.createElement('div');
  const t = document.createElement('div'); t.className = 'k-active__title'; t.textContent = picked ? 'Везёте заказ покупателю' : cooking ? 'Ресторан ещё готовит заказ' : 'Заберите заказ в ресторане';
  const n = document.createElement('div'); n.className = 'ohead__sub';
  n.textContent = 'Заказ #' + no(d.order_id) + ' · ' + price(d.total_kopecks) + ' · оплата ' + price(d.payout_kopecks);
  title.append(t, n);
  const badge = document.createElement('span');
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
  next.onclick = () => act(foot, () => Api.setDeliveryStatus(d.id, picked ? 'delivered' : 'picked_up'), picked ? 'Заказ доставлен — отличная работа!' : '');
  foot.append(next);

  return [head, steps, what, foot];
}

/* ---------- история ---------- */
function renderHistory(ok){
  const list = $('k-hist'); list.textContent = '';
  list.hidden = !history.length;
  $('k-hist-empty').hidden = !!history.length || !ok;
  for (const d of history) {
    const row = document.createElement('div'); row.className = 'k-row k-row--hist';
    const when = document.createElement('span'); when.className = 'k-row__when';
    when.textContent = new Date(d.delivered_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const num = document.createElement('strong'); num.className = 'k-row__no'; num.textContent = '#' + no(d.order_id);
    const rest = document.createElement('div'); rest.className = 'k-row__rest';
    const rn = document.createElement('strong'); rn.textContent = d.restaurant_name;
    const items = document.createElement('small'); items.textContent = itemsText(d);
    rest.append(rn, items);
    const addr = document.createElement('span'); addr.className = 'k-row__addr'; addr.textContent = d.delivery_address;
    const pay = document.createElement('strong'); pay.className = 'k-row__pay'; pay.textContent = price(d.payout_kopecks);
    row.append(when, num, rest, addr, pay);
    list.append(row);
  }
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
$('k-refresh').onclick = () => { load(); loadStats(); };
document.querySelectorAll('[data-ktab]').forEach(b => { b.onclick = () => { tab = b.dataset.ktab; render(); }; });
document.addEventListener('pass:notifications', () => { if (poll) load(true); });
