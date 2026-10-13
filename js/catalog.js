/* PassDelivery — каталог ресторанов и меню для покупателя
   (макеты 02-restaurants, node 37:1258, и 03-restaurant-menu, node 37:1340) */
import { Api } from './api.js';
import { $, say, busy, errText, initials, price, placeholderBg, showPage } from './ui.js';
import { getCart, itemOf, addDish, stepper, onCartChange, cartError } from './cart.js';
import { ratingSummary, renderReviewList } from './reviews.js';

let rests = null;      // последний загруженный список открытых ресторанов
let query = '';
let openedId = null;   // id ресторана на странице меню
let lastMenu = null;   // меню открытого ресторана — перерисовываем его, когда меняется корзина
let canOrder = false;  // корзина есть только у покупателя
let viewerRole = '';
let openedIsOpen = true;

export function setCanOrder(on, role){ canOrder = on; viewerRole = role || ''; }

// 404 без JSON — роута нет на бэке (каталог живёт в ветке feature/restaurants)
const routeMissing = (e) => e.status === 404 && !e.body;

/* ---------- каталог ---------- */
export async function openCatalog(){
  showPage('catalog');
  if (rests) renderCatalog();
  say('catalog-msg', '');
  try {
    rests = (await Api.restaurants()) || [];
  } catch (e) {
    say('catalog-msg', routeMissing(e) ? 'Каталог пока недоступен: на сервере нет ручки GET /restaurants' : errText(e), 'err');
    if (!rests) rests = [];
  }
  renderCatalog();
}

export function setQuery(q){
  query = q.trim().toLowerCase();
  if (rests) renderCatalog();
}

function renderCatalog(){
  const grid = $('rest-grid'); grid.textContent = '';
  const shown = rests.filter(r => !query ||
    [r.name, r.description, r.address].some(v => (v || '').toLowerCase().includes(query)));

  for (const r of shown) {
    const card = document.createElement('a');
    card.className = 'rest-card'; card.href = '#/restaurants/' + r.id;

    const img = document.createElement('div'); img.className = 'rest-card__img';
    img.style.background = placeholderBg(r.id);
    const mark = document.createElement('span'); mark.textContent = initials(r.name); mark.setAttribute('aria-hidden', 'true');
    img.append(mark);

    const body = document.createElement('div'); body.className = 'rest-card__body';
    const name = document.createElement('div'); name.className = 'rest-card__name'; name.textContent = r.name;
    const meta = document.createElement('div'); meta.className = 'rest-card__meta'; meta.textContent = r.description || r.address;
    body.append(name, meta);

    card.append(img, body);
    grid.append(card);
  }

  const empty = $('catalog-empty');
  empty.hidden = shown.length > 0 || $('catalog-msg').textContent !== '';
  empty.textContent = query ? 'Ничего не нашлось по запросу «' + query + '»' : 'Пока нет открытых ресторанов';
}

/* ---------- страница ресторана ---------- */
export async function openRestaurant(id){
  showPage('restaurant');
  if (openedId !== id) {
    openedId = id;
    $('r-name').textContent = ''; $('r-meta').textContent = ''; $('r-desc').textContent = '';
    $('r-closed').hidden = true; $('r-cats').textContent = ''; $('r-menu').textContent = ''; $('r-empty').hidden = true;
    lastMenu = null; renderCartPill();
    $('r-reviews').hidden = true; $('r-rv-list').textContent = '';
    $('r-hero').style.background = placeholderBg(id);
    window.scrollTo(0, 0);
  }
  say('r-msg', '');
  try {
    const [r, menu] = await Promise.all([Api.restaurant(id), Api.menu(id)]);
    if (openedId !== id) return;          // пока грузили, пользователь ушёл на другой ресторан
    renderHero(r);
    renderMenu(menu);
    loadReviews(r);
  } catch (e) {
    if (openedId !== id) return;
    say('r-msg',
      routeMissing(e) ? 'Меню пока недоступно: на сервере нет ручек каталога' :
      e.status === 404 ? 'Ресторан не найден' :
      e.status === 400 ? 'Неверная ссылка на ресторан' : errText(e), 'err');
  }
}

// Отзывы грузим отдельно: если их нет или ручка недоступна — меню всё равно показываем
async function loadReviews(r){
  let reviews = [];
  try { reviews = (await Api.restaurantReviews(r.id)) || []; } catch { return; }
  if (openedId !== r.id) return;
  const summary = ratingSummary(reviews);
  $('r-meta').textContent = [summary, r.address, r.phone].filter(Boolean).join(' · ');
  $('r-rv-sum').textContent = summary;
  renderReviewList($('r-rv-list'), reviews);
  $('r-reviews').hidden = reviews.length === 0;
}

function renderHero(r){
  $('r-name').textContent = r.name;
  $('r-meta').textContent = [r.address, r.phone].filter(Boolean).join(' · ');
  $('r-desc').textContent = r.description || '';
  $('r-closed').hidden = !!r.is_open;
  openedIsOpen = !!r.is_open;
  const roleName = { restaurant_owner: 'владелец ресторана', courier: 'курьер', admin: 'администратор' }[viewerRole];
  $('r-note').hidden = canOrder || !roleName;
  $('r-note-role').textContent = roleName || '';
}

function renderMenu(menu){
  lastMenu = menu;
  const nav = $('r-cats'); nav.textContent = '';
  const box = $('r-menu'); box.textContent = '';
  const cats = menu.categories || [];

  for (const c of cats) {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip'; chip.textContent = c.name;
    chip.onclick = () => document.getElementById('cat-' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.append(chip);

    const section = document.createElement('section'); section.className = 'menu-sec'; section.id = 'cat-' + c.id;
    const h = document.createElement('h2'); h.textContent = c.name;
    const grid = document.createElement('div'); grid.className = 'dish-grid';
    for (const d of c.dishes || []) grid.append(dishCard(d));
    section.append(h, grid);
    box.append(section);
  }

  nav.hidden = cats.length < 2;
  $('r-empty').hidden = cats.length > 0;
  $('r-empty').textContent = 'Ресторан ещё не добавил блюда в меню.';
  renderCartPill();
}

// «Корзина · 2 товара · 1 240 ₽» рядом с категориями — только если в корзине блюда этого ресторана
function renderCartPill(){
  const pill = $('r-cartpill');
  const c = getCart();
  const n = (c?.items || []).reduce((sum, i) => sum + i.quantity, 0);
  pill.hidden = !canOrder || !n || c.restaurant_id !== openedId;
  pill.textContent = n ? 'Корзина · ' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') + ' · ' + price(c.total_kopecks) : '';
}

function plural(n, one, few, many){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

onCartChange(() => {
  if (!lastMenu || $('r-menu').closest('[data-page]').hidden) return;
  const y = window.scrollY;
  renderMenu(lastMenu);
  window.scrollTo(0, y);
});

function dishAction(d){
  const inCart = itemOf(d.id);
  if (inCart) return stepper(inCart);

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn-cart'; btn.textContent = 'В корзину';
  btn.onclick = async () => {
    busy(btn, true); say('r-msg', '');
    try { await addDish(d); }
    catch (e) { say('r-msg', cartError(e), 'err'); }
    finally { busy(btn, false); }
  };
  return btn;
}

function dishCard(d){
  const card = document.createElement('article'); card.className = 'dish-card';

  const img = document.createElement('div'); img.className = 'dish-card__img';
  img.style.background = placeholderBg(d.id);
  const mark = document.createElement('span'); mark.textContent = (d.name || '·')[0].toUpperCase(); mark.setAttribute('aria-hidden', 'true');
  img.append(mark);

  const body = document.createElement('div'); body.className = 'dish-card__body';
  const name = document.createElement('h3'); name.className = 'dish-card__name'; name.textContent = d.name;
  body.append(name);
  const meta = [d.description, d.cooking_time_minutes ? d.cooking_time_minutes + ' мин' : null].filter(Boolean).join(' · ');
  if (meta) { const m = document.createElement('p'); m.className = 'dish-card__meta'; m.textContent = meta; body.append(m); }
  const foot = document.createElement('div'); foot.className = 'dish-card__foot';
  const pr = document.createElement('div'); pr.className = 'dish-card__price'; pr.textContent = price(d.price_kopecks);
  foot.append(pr);
  if (canOrder && openedIsOpen) foot.append(dishAction(d));
  body.append(foot);

  card.append(img, body);
  return card;
}
