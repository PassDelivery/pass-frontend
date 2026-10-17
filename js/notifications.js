/* PassDelivery — уведомления: колокольчик со счётчиком и выпадающий список.
   Колокольчиков три (шапка покупателя, кабинеты владельца и курьера), панель одна. */
import { Api } from './api.js';
import { $ } from './ui.js';

const BELLS = ['nb-shell', 'nb-owner', 'nb-courier'];
let role = null;
let items = [];
let poll = null;
let anchor = null;
let seen = null;          // id уже полученных уведомлений; null — первая загрузка

export function startNotifications(userRole){
  role = userRole;
  load();
  clearInterval(poll);
  poll = setInterval(() => { if (!document.hidden) load(); }, 5000);
}

export function stopNotifications(){
  clearInterval(poll); poll = null; role = null; items = []; seen = null;
  close(); renderCount();
}

async function load(){
  try { items = (await Api.notifications()) || []; }
  catch { return; }                       // нет ручки или сети — колокольчик просто молчит
  // о новых уведомлениях сообщаем экранам: они сразу перезапрашивают свои данные, не дожидаясь своего опроса
  const fresh = seen ? items.filter(n => !seen.has(n.id)) : [];
  seen = new Set(items.map(n => n.id));
  if (fresh.length) document.dispatchEvent(new CustomEvent('pass:notifications', { detail: fresh }));
  renderCount();
  if (!$('notif-panel').hidden) renderList();
}

function renderCount(){
  const unread = items.filter(n => !n.is_read).length;
  for (const id of BELLS) {
    const c = $(id).querySelector('.bell__count');
    c.textContent = unread > 9 ? '9+' : String(unread);
    c.hidden = unread === 0;
    $(id).setAttribute('aria-label', unread ? 'Уведомления, непрочитанных: ' + unread : 'Уведомления');
  }
}

function ago(iso){
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return min + ' мин назад';
  if (min < 24 * 60) return Math.round(min / 60) + ' ч назад';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function renderList(){
  const box = $('notif-list'); box.textContent = '';
  for (const n of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'notif' + (n.is_read ? '' : ' notif--new');
    const text = document.createElement('span'); text.className = 'notif__body'; text.textContent = n.body;
    const when = document.createElement('span'); when.className = 'notif__time'; when.textContent = ago(n.created_at);
    b.append(text, when);
    b.onclick = () => openNotification(n);
    box.append(b);
  }
  $('notif-empty').hidden = items.length > 0;
  $('notif-readall').hidden = !items.some(n => !n.is_read);
}

async function markRead(n){
  if (n.is_read) return;
  try { await Api.readNotification(n.id); n.is_read = true; } catch { /* не страшно — отметится в следующий раз */ }
}

async function openNotification(n){
  await markRead(n);
  renderCount(); close();
  if (!n.order_id) return;
  location.hash = role === 'restaurant_owner' ? '#/owner/orders'
    : role === 'courier' ? '#/courier'
    : '#/orders/' + n.order_id;
}

async function readAll(){
  await Promise.all(items.filter(n => !n.is_read).map(markRead));
  renderCount(); renderList();
}

function open(btn){
  anchor = btn;
  renderList();
  const panel = $('notif-panel');
  panel.hidden = false;
  const r = btn.getBoundingClientRect();
  const width = Math.min(380, window.innerWidth - 24);
  panel.style.width = width + 'px';
  panel.style.top = Math.round(r.bottom + 8) + 'px';
  panel.style.left = Math.round(Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  load();
}

function close(){
  $('notif-panel').hidden = true;
  anchor?.setAttribute('aria-expanded', 'false');
  anchor = null;
}

for (const id of BELLS) {
  $(id).onclick = (e) => { e.stopPropagation(); anchor === $(id) ? close() : open($(id)); };
}
$('notif-readall').onclick = (e) => { e.stopPropagation(); readAll(); };
$('notif-panel').onclick = (e) => e.stopPropagation();
document.addEventListener('click', () => { if (anchor) close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && anchor) { const a = anchor; close(); a.focus(); } });
window.addEventListener('hashchange', close);
