/* PassDelivery — кабинет владельца ресторана (макет 09-restaurant-owner, node 37:1859) */
import { Api, store } from './api.js';
import { $, say, busy, errText, initials, price } from './ui.js';
import { ratingSummary, renderReviewList } from './reviews.js';

export const OWNER_TABS = ['overview', 'menu', 'orders', 'reviews', 'settings'];

let owner = null;        // текущий пользователь
let list = [];           // его рестораны
let currentId = null;
let creating = false;    // форма в режиме «новый ресторан»

/* GET /internal/restaurants на бэке пока нет — держим копию в localStorage,
   чтобы созданный ресторан не пропадал после перезагрузки страницы */
const cacheKey = () => 'pass_owner_rests_' + owner.id;
const readCache = () => { try { return JSON.parse(store.get(cacheKey())) || []; } catch { return []; } };
const saveCache = () => store.set(cacheKey(), JSON.stringify(list));

const current = () => list.find(r => r.id === currentId) || null;

async function load(){
  say('owner-msg', '');
  try {
    list = (await Api.myRestaurants()) || [];
    saveCache();
  } catch (e) {
    list = readCache();
    if (e.status !== 404 && e.status !== 405) say('owner-msg', errText(e), 'err');
  }
  const saved = store.get('pass_owner_current');
  currentId = list.some(r => r.id === saved) ? saved : list[0]?.id || null;
}

export async function openOwner(user, tab){
  if (owner?.id !== user.id) { owner = user; creating = false; await load(); }
  show(tab);
}

export function resetOwner(){ owner = null; list = []; currentId = null; creating = false; cats = []; dishes = []; catsFor = null; stopOrdersPoll(); rOrders = []; }

function show(tab){
  if (!OWNER_TABS.includes(tab)) tab = 'overview';
  const r = current();
  if (!r) creating = true;
  const view = creating ? 'settings' : tab;
  document.querySelectorAll('[data-oview]').forEach(v => { v.hidden = v.dataset.oview !== view; });
  document.querySelectorAll('#o-nav a').forEach(a => {
    if (!creating && a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('o-nav').hidden = !r;
  renderSide();
  if (r) renderOverview(r);
  fillForm(creating ? null : r);
  if (r && view === 'menu') loadCategories(r.id);
  if (r && view === 'orders') openOrders(r.id); else stopOrdersPoll();
  if (r && view === 'reviews') loadOwnerReviews(r.id);
}

/* ---------- боковая панель ---------- */
function renderSide(){
  const r = current();
  $('o-avatar').textContent = r ? initials(r.name) : '+';
  $('o-name').textContent = r ? r.name : 'Нет ресторана';
  $('o-status').textContent = r ? (r.is_open ? 'Онлайн' : 'Закрыт') : 'Создайте первый';
  $('o-dot').hidden = !r;
  $('o-dot').classList.toggle('dot--on', !!r?.is_open);

  const sel = $('o-switch');
  sel.hidden = list.length < 2;
  sel.textContent = '';
  for (const x of list) {
    const o = document.createElement('option'); o.value = x.id; o.textContent = x.name;
    if (x.id === currentId) o.selected = true;
    sel.append(o);
  }
  $('o-new').hidden = !r || creating;
}

/* ---------- обзор ---------- */
function renderOverview(r){
  $('ov-title').textContent = r.name;
  $('ov-desc').textContent = r.description || 'Без описания';
  $('ov-address').textContent = r.address;
  $('ov-phone').textContent = r.phone || '—';
  $('ov-created').textContent = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const sw = $('ov-open');
  sw.setAttribute('aria-checked', String(!!r.is_open));
  $('ov-open-text').textContent = r.is_open ? 'Ресторан принимает заказы' : 'Ресторан закрыт для заказов';
}

function replace(updated){
  list = list.map(x => x.id === updated.id ? updated : x);
  saveCache();
}

async function toggleOpen(){
  const r = current(); if (!r) return;
  const btn = $('ov-open'); busy(btn, true); say('ov-msg', '');
  try {
    replace(await Api.updateRestaurant(r.id, { is_open: !r.is_open }));
    renderSide(); renderOverview(current());
  } catch (e) { say('ov-msg', errText(e), 'err'); }
  finally { busy(btn, false); }
}

/* ---------- настройки / создание ---------- */
function fillForm(r){
  $('rs-title').textContent = r ? 'Настройки' : 'Новый ресторан';
  $('rs-sub').textContent = r ? 'Информация, которую видят покупатели' : 'Заполните данные — ресторан появится в каталоге, когда вы его откроете';
  $('rs-name').value = r?.name || '';
  $('rs-desc').value = r?.description || '';
  $('rs-address').value = r?.address || '';
  $('rs-phone').value = r?.phone || '';
  $('rs-open').checked = r ? !!r.is_open : true;
  $('rs-save').textContent = r ? 'Сохранить' : 'Создать ресторан';
  $('rs-cancel').hidden = !(creating && list.length);
  say('rs-msg', '');
}

function readForm(){
  const v = {
    name: $('rs-name').value.trim(),
    description: $('rs-desc').value.trim(),
    address: $('rs-address').value.trim(),
    phone: $('rs-phone').value.replace(/[\s()-]/g, ''),
    is_open: $('rs-open').checked,
  };
  if (v.name.length < 2) return [v, 'Название — минимум 2 символа'];
  if (v.address.length < 5) return [v, 'Адрес — минимум 5 символов'];
  if (v.description && (v.description.length < 5 || v.description.length > 100)) return [v, 'Описание — от 5 до 100 символов'];
  if (v.phone && !/^\+7\d{10}$/.test(v.phone)) return [v, 'Телефон в формате +79991234567'];
  return [v, null];
}

async function saveForm(ev){
  ev.preventDefault();
  const [v, err] = readForm();
  if (err) return say('rs-msg', err, 'err');
  const r = creating ? null : current();

  let body;
  if (r) {
    // PATCH: только изменённые поля; очищенные описание и телефон уходят пустой строкой
    body = {};
    for (const k of Object.keys(v)) if (v[k] !== (r[k] ?? (k === 'is_open' ? false : ''))) body[k] = v[k];
    if (!Object.keys(body).length) return say('rs-msg', 'Нет изменений');
  } else {
    body = { name: v.name, address: v.address, is_open: v.is_open };
    if (v.description) body.description = v.description;
    if (v.phone) body.phone = v.phone;
  }

  const btn = $('rs-save'); busy(btn, true); say('rs-msg', '');
  try {
    if (r) {
      replace(await Api.updateRestaurant(r.id, body));
      show('settings');
      say('rs-msg', 'Сохранено', 'ok');
    } else {
      const created = await Api.createRestaurant(body);
      list = [...list, created]; saveCache();
      select(created.id);
      creating = false;
      location.hash = '#/owner/overview';
      show('overview');
    }
  } catch (e) { say('rs-msg', errText(e), 'err'); }
  finally { busy(btn, false); }
}

function select(id){
  currentId = id;
  store.set('pass_owner_current', id);
}

function startCreate(){
  creating = true;
  location.hash = '#/owner/settings';
  show('settings');
  $('rs-name').focus();
}

function cancelCreate(){
  creating = false;
  location.hash = '#/owner/overview';
  show('overview');
}

/* ---------- меню: категории ---------- */
/* Списка категорий (GET) на бэке пока нет — как и с ресторанами, держим копию в localStorage */
let cats = [];            // категории текущего ресторана
let catsFor = null;       // id ресторана, для которого загружены cats
let activeCat = 'all';

const catKey = (restId) => 'pass_owner_cats_' + restId;
const readCats = (restId) => { try { return JSON.parse(store.get(catKey(restId))) || []; } catch { return []; } };
const saveCats = () => store.set(catKey(catsFor), JSON.stringify(cats));
const byOrder = (a, b) => Number(a.sort_order) - Number(b.sort_order) || a.name.localeCompare(b.name, 'ru');

/* Списка блюд (GET) тоже нет — храним созданные в localStorage */
let dishes = [];
const dishKey = (restId) => 'pass_owner_dishes_' + restId;
const readDishes = (restId) => { try { return JSON.parse(store.get(dishKey(restId))) || []; } catch { return []; } };
const saveDishes = () => store.set(dishKey(catsFor), JSON.stringify(dishes));

const ICON_EDIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>';
let editingDish = null;   // блюдо в диалоге (null — новое)


async function loadCategories(restId){
  if (catsFor !== restId) { catsFor = restId; activeCat = 'all'; cats = readCats(restId); dishes = readDishes(restId); }
  renderMenu();
  say('cat-msg', '');
  try {
    cats = (await Api.categories(restId)) || [];
    saveCats(); renderMenu();
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) say('cat-msg', errText(e), 'err');
  }
}

function renderMenu(){
  const box = $('cat-chips'); box.textContent = '';
  const sorted = [...cats].sort(byOrder);
  if (!sorted.some(c => c.id === activeCat)) activeCat = 'all';

  const chip = (id, text) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.role = 'tab'; b.textContent = text;
    b.setAttribute('aria-selected', String(activeCat === id));
    b.onclick = () => { activeCat = id; renderMenu(); };
    box.append(b);
  };
  if (sorted.length) {
    chip('all', 'Все блюда');
    for (const c of sorted) chip(c.id, c.name);
  } else {
    const p = document.createElement('p'); p.className = 'chips__empty';
    p.textContent = 'Категорий пока нет — создайте первую, например «Пицца» или «Десерты».';
    box.append(p);
  }

  const active = sorted.find(c => c.id === activeCat);
  $('dish-new').disabled = !sorted.length;
  $('dish-new').title = sorted.length ? '' : 'Сначала создайте категорию';
  renderDishes(sorted, active);
}

function renderDishes(sorted, active){
  const box = $('dish-list'); box.textContent = '';
  const catName = new Map(sorted.map(c => [c.id, c.name]));
  const catPos = new Map(sorted.map((c, i) => [c.id, i]));
  const shown = dishes
    .filter(d => !active || d.category_id === active.id)
    .sort((a, b) => (catPos.get(a.category_id) ?? 99) - (catPos.get(b.category_id) ?? 99));

  for (const d of shown) {
    const row = document.createElement('div'); row.className = 'dish';

    const main = document.createElement('div'); main.className = 'dish__main';
    const thumb = document.createElement('span'); thumb.className = 'dish__thumb'; thumb.setAttribute('aria-hidden', 'true');
    thumb.textContent = (d.name || '·')[0].toUpperCase();
    const info = document.createElement('div'); info.style.minWidth = '0';
    const name = document.createElement('div'); name.className = 'dish__name'; name.textContent = d.name;
    info.append(name);
    const meta = [d.description, d.cooking_time_minutes ? d.cooking_time_minutes + ' мин' : null].filter(Boolean).join(' · ');
    if (meta) { const s = document.createElement('div'); s.className = 'dish__desc'; s.textContent = meta; info.append(s); }
    main.append(thumb, info);

    const cat = document.createElement('div'); cat.className = 'dish__cat'; cat.textContent = catName.get(d.category_id) || '—';
    const pr = document.createElement('div'); pr.className = 'dish__price'; pr.textContent = price(d.price_kopecks);
    const st = document.createElement('button');
    st.type = 'button';
    st.className = 'status' + (d.is_available ? '' : ' status--off');
    st.textContent = d.is_available ? 'В продаже' : 'Скрыто';
    st.title = d.is_available ? 'Скрыть из меню' : 'Вернуть в продажу';
    st.onclick = () => toggleDish(d, st);

    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'icon-btn'; edit.innerHTML = ICON_EDIT;
    edit.setAttribute('aria-label', 'Изменить блюдо ' + d.name);
    edit.onclick = () => openDish(d);

    row.append(main, cat, pr, st, edit);
    box.append(row);
  }

  $('dish-empty').textContent = shown.length ? ''
    : !sorted.length ? 'Блюд пока нет. Сначала создайте категории — блюда добавляются в них.'
    : active ? 'В категории «' + active.name + '» пока нет блюд.'
    : 'Блюд пока нет — добавьте первое.';
}

const rublesText = (kopecks) => (kopecks % 100 ? (kopecks / 100).toFixed(2).replace('.', ',') : String(kopecks / 100));

function openDish(d){
  editingDish = d || null;
  const selected = d ? d.category_id : activeCat;
  const sel = $('d-cat'); sel.textContent = '';
  for (const c of [...cats].sort(byOrder)) {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
    if (c.id === selected) o.selected = true;
    sel.append(o);
  }
  $('d-name').value = d?.name || '';
  $('d-desc').value = d?.description || '';
  $('d-price').value = d ? rublesText(d.price_kopecks) : '';
  $('d-time').value = d?.cooking_time_minutes || '';
  $('d-available').checked = d ? !!d.is_available : true;
  $('dish-form-title').textContent = d ? 'Изменить блюдо' : 'Новое блюдо';
  $('dish-save').textContent = d ? 'Сохранить' : 'Добавить блюдо';
  say('dish-form-msg', '');
  $('dish-dialog').showModal();
  $('d-name').focus();
}

async function saveDish(ev){
  ev.preventDefault();
  const name = $('d-name').value.trim();
  const description = $('d-desc').value.trim();
  const priceText = $('d-price').value.trim().replace(/\s/g, '').replace(',', '.');
  const rubles = /^\d+(\.\d{1,2})?$/.test(priceText) ? Number(priceText) : NaN;
  const time = $('d-time').value.trim();
  const category_id = $('d-cat').value;

  if (!category_id) return say('dish-form-msg', 'Выберите категорию', 'err');
  if (name.length < 2 || name.length > 50) return say('dish-form-msg', 'Название — от 2 до 50 символов', 'err');
  if (description && (description.length < 5 || description.length > 200)) return say('dish-form-msg', 'Описание — от 5 до 200 символов', 'err');
  if (!(rubles > 0)) return say('dish-form-msg', 'Цена — число больше нуля, например 540 или 390,50', 'err');
  if (time && !(Number.isInteger(Number(time)) && Number(time) > 0)) return say('dish-form-msg', 'Время готовки — целое число минут', 'err');

  const v = {
    category_id, name,
    description: description || null,
    price_kopecks: Math.round(rubles * 100),
    cooking_time_minutes: time ? Number(time) : null,
    is_available: $('d-available').checked,
  };

  let body;
  const was = editingDish;
  if (was) {
    // PATCH: только изменённые поля; очищенные описание и время уходят как null
    body = {};
    for (const k of Object.keys(v)) if (v[k] !== (was[k] ?? null)) body[k] = v[k];
    if (!Object.keys(body).length) return $('dish-dialog').close();
  } else {
    body = { category_id, name, price_kopecks: v.price_kopecks, is_available: v.is_available };
    if (v.description) body.description = v.description;
    if (v.cooking_time_minutes) body.cooking_time_minutes = v.cooking_time_minutes;
  }

  const r = current(); if (!r) return;
  const btn = $('dish-save'); busy(btn, true); say('dish-form-msg', '');
  try {
    const saved = was ? await Api.updateDish(was.id, body) : await Api.addDish(r.id, body);
    if (catsFor === r.id) { putDish(saved); }
    $('dish-dialog').close();
    renderMenu();
    say('cat-msg', 'Блюдо «' + saved.name + '» ' + (was ? 'сохранено' : 'добавлено'), 'ok');
  } catch (e) {
    say('dish-form-msg', dishErr(e, was ? 'изменять' : 'добавлять'), 'err');
    if (was && e.status === 404 && e.body) dropDish(was.id);
  } finally { busy(btn, false); }
}

function putDish(d){
  dishes = dishes.some(x => x.id === d.id) ? dishes.map(x => x.id === d.id ? d : x) : [...dishes, d];
  saveDishes();
}

function dropDish(id){ dishes = dishes.filter(x => x.id !== id); saveDishes(); renderMenu(); }

function dishErr(e, verb){
  const text = e.body?.error || '';
  if (text.includes('category not in restaurant')) return 'Этой категории нет в ресторане — обновите страницу';
  if (e.status === 404 && !e.body) return 'Сервер пока не умеет ' + verb + ' блюда (404)';
  if (e.status === 404) return 'Блюдо не найдено — возможно, его удалили';
  if (e.status === 409) return 'Блюдо есть в активных заказах — скрыть его можно после их завершения';
  return errText(e);
}

// Скрываем через DELETE (бэк не даст скрыть блюдо из активного заказа — 409), возвращаем в продажу через PATCH
async function toggleDish(d, btn){
  busy(btn, true); say('cat-msg', '');
  try {
    if (d.is_available) {
      await Api.hideDish(d.id);
      putDish({ ...d, is_available: false });
    } else {
      putDish(await Api.updateDish(d.id, { is_available: true }));
    }
    renderMenu();
  } catch (e) {
    busy(btn, false);
    say('cat-msg', dishErr(e, 'изменять'), 'err');
    if (e.status === 404 && e.body) dropDish(d.id);
  }
}

function openCategory(){
  const max = cats.reduce((m, c) => Math.max(m, Number(c.sort_order) || 0), 0);
  $('c-name').value = '';
  $('c-order').value = String(max + 1);
  say('cat-form-msg', '');
  $('cat-dialog').showModal();
  $('c-name').focus();
}

async function saveCategory(ev){
  ev.preventDefault();
  const name = $('c-name').value.trim();
  const order = Number($('c-order').value);
  if (name.length < 3 || name.length > 35) return say('cat-form-msg', 'Название — от 3 до 35 символов', 'err');
  if (!Number.isInteger(order) || order < 1) return say('cat-form-msg', 'Порядок — целое число от 1', 'err');
  if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) return say('cat-form-msg', 'Такая категория уже есть', 'err');

  const r = current(); if (!r) return;
  const btn = $('cat-save'); busy(btn, true); say('cat-form-msg', '');
  try {
    const created = await Api.addCategory(r.id, { name, sort_order: order });
    if (catsFor === r.id) { cats = [...cats, created]; saveCats(); }
    activeCat = created.id;
    $('cat-dialog').close();
    renderMenu();
    say('cat-msg', 'Категория «' + created.name + '» добавлена', 'ok');
  } catch (e) {
    // 404 без JSON — это ServeMux: роут ещё не зарегистрирован на бэке
    say('cat-form-msg', e.status === 404 && !e.body ? 'Сервер пока не умеет добавлять категории (404)' : errText(e), 'err');
  } finally { busy(btn, false); }
}

/* ---------- отзывы ресторана ---------- */
async function loadOwnerReviews(restId){
  say('orv-msg', '');
  $('orv-list').textContent = ''; $('orv-empty').hidden = true;
  let reviews;
  try { reviews = (await Api.restaurantReviews(restId)) || []; }
  catch (e) { return say('orv-msg', e.status === 404 && !e.body ? 'Отзывы пока недоступны: на сервере нет ручки /restaurants/{id}/reviews' : errText(e), 'err'); }
  if (currentId !== restId) return;
  $('orv-sum').textContent = ratingSummary(reviews) || 'Что говорят покупатели';
  renderReviewList($('orv-list'), reviews);
  $('orv-empty').hidden = reviews.length > 0;
}

/* ---------- заказы ресторана ---------- */
const O_STATUS = {
  new: 'Новый', accepted: 'Принят', cooking: 'Готовится', ready: 'Готов',
  delivering: 'В пути', delivered: 'Доставлен', cancelled: 'Отменён покупателем', rejected: 'Отклонён',
};
// что ресторан может сделать с заказом в каждом статусе (то же, что разрешает бэк)
const O_ACTIONS = {
  new:      [{ to: 'accepted', label: 'Принять', primary: true }, { to: 'rejected', label: 'Отклонить', danger: true }],
  accepted: [{ to: 'cooking', label: 'Начать готовить', primary: true }],
  cooking:  [{ to: 'ready', label: 'Готово', primary: true }],
};
const O_TABS = [
  { id: 'new',    label: 'Новые',       match: s => s === 'new' },
  { id: 'work',   label: 'В работе',    match: s => ['accepted', 'cooking', 'ready'].includes(s) },
  { id: 'done',   label: 'Завершённые', match: s => ['delivering', 'delivered', 'cancelled', 'rejected'].includes(s) },
];
let rOrders = [];
let ordersFor = null;
let oTab = 'new';
let oPoll = null;

function stopOrdersPoll(){ clearInterval(oPoll); oPoll = null; }

async function openOrders(restId){
  if (ordersFor !== restId) { ordersFor = restId; rOrders = []; oTab = 'new'; }
  renderOrders();
  await loadOrders(restId);
  stopOrdersPoll();
  oPoll = setInterval(() => { if (!document.hidden) loadOrders(restId, true); }, 20000);
}

async function loadOrders(restId, quiet){
  if (!quiet) say('oo-msg', '');
  try {
    const fresh = (await Api.restaurantOrders(restId)) || [];
    if (ordersFor !== restId) return;
    rOrders = fresh;
    renderOrders();
  } catch (e) {
    if (quiet) return;
    say('oo-msg', e.status === 404 && !e.body ? 'Список заказов пока недоступен: на сервере нет ручки /internal/restaurants/{id}/orders' : errText(e), 'err');
  }
}

const oNo = (id) => 'PD-' + String(id).slice(0, 6).toUpperCase();
const oTime = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function renderOrders(){
  const newCount = rOrders.filter(o => o.status === 'new').length;
  $('oo-count').textContent = newCount; $('oo-count').hidden = newCount === 0;

  const tabs = $('oo-tabs'); tabs.textContent = '';
  for (const t of O_TABS) {
    const n = rOrders.filter(o => t.match(o.status)).length;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.role = 'tab';
    b.textContent = t.label + (n ? ' · ' + n : '');
    b.setAttribute('aria-selected', String(oTab === t.id));
    b.onclick = () => { oTab = t.id; renderOrders(); };
    tabs.append(b);
  }

  const tab = O_TABS.find(t => t.id === oTab);
  const shown = rOrders.filter(o => tab.match(o.status));
  const box = $('oo-list'); box.textContent = '';
  for (const o of shown) box.append(orderCard(o));

  $('oo-empty').hidden = shown.length > 0;
  $('oo-empty-text').textContent = oTab === 'new' ? 'Новых заказов нет — они появятся здесь сами' : oTab === 'work' ? 'Сейчас ничего не готовится' : 'Завершённых заказов пока нет';
}

function orderCard(o){
  const card = document.createElement('article'); card.className = 'panel oo-card oo-card--' + o.status;

  const head = document.createElement('div'); head.className = 'oo-card__head';
  const no = document.createElement('strong'); no.textContent = '№' + oNo(o.id);
  const time = document.createElement('span'); time.className = 'oo-card__time'; time.textContent = oTime(o.created_at);
  const st = document.createElement('span'); st.className = 'oo-badge oo-badge--' + o.status; st.textContent = O_STATUS[o.status] || o.status;
  head.append(no, time, st);

  const items = document.createElement('ul'); items.className = 'oo-card__items';
  for (const i of o.items) {
    const li = document.createElement('li');
    const q = document.createElement('b'); q.textContent = i.quantity + ' ×';
    li.append(q, ' ' + i.dish_name);
    items.append(li);
  }

  const meta = document.createElement('div'); meta.className = 'oo-card__meta';
  const line = (k, v) => { if (!v) return; const p = document.createElement('div'); const s = document.createElement('span'); s.textContent = k; p.append(s, ' ' + v); meta.append(p); };
  line('Покупатель:', [o.customer_name, o.customer_phone].filter(Boolean).join(', '));
  line('Адрес:', o.delivery_address);
  line('Комментарий:', o.comment);

  const foot = document.createElement('div'); foot.className = 'oo-card__foot';
  const total = document.createElement('strong'); total.textContent = price(o.total_kopecks);
  const acts = document.createElement('div'); acts.className = 'oo-card__acts';
  for (const a of O_ACTIONS[o.status] || []) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label;
    b.className = a.primary ? 'primary' : a.danger ? 'oo-reject' : '';
    b.onclick = () => moveOrder(o, a, card);
    acts.append(b);
  }
  foot.append(total, acts);

  card.append(head, items, meta, foot);
  return card;
}

async function moveOrder(o, action, card){
  if (action.to === 'rejected' && !confirm('Отклонить заказ №' + oNo(o.id) + '? Покупатель увидит, что ресторан его отклонил.')) return;
  card.querySelectorAll('button').forEach(b => busy(b, true)); say('oo-msg', '');
  try {
    const updated = await Api.setOrderStatus(o.id, action.to);
    rOrders = rOrders.map(x => x.id === o.id ? { ...x, status: updated.status, updated_at: updated.updated_at } : x);
    renderOrders();
  } catch (e) {
    say('oo-msg', e.status === 409 ? 'Статус заказа уже изменился — список обновлён' : errText(e), 'err');
    loadOrders(ordersFor, true);
  }
}

$('oo-refresh').onclick = () => ordersFor && loadOrders(ordersFor);

$('cat-new').onclick = openCategory;
$('dish-new').onclick = () => openDish(null);
$('dish-form').onsubmit = saveDish;
$('dish-cancel').onclick = () => $('dish-dialog').close();
$('dish-dialog').addEventListener('close', () => { editingDish = null; });
$('cat-form').onsubmit = saveCategory;
$('cat-cancel').onclick = () => $('cat-dialog').close();

$('ov-open').onclick = toggleOpen;
$('rs-form').onsubmit = saveForm;
$('o-new').onclick = startCreate;
$('rs-cancel').onclick = cancelCreate;
$('o-switch').onchange = (e) => { select(e.target.value); creating = false; show(location.hash.match(/^#\/owner\/(\w+)/)?.[1] || 'overview'); };
