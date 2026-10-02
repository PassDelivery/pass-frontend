import { session, Api } from './api.js';

/* ===================== UI ===================== */
const $ = (id) => document.getElementById(id);
const roleNames = { customer:'Клиент', restaurant_owner:'Владелец ресторана', courier:'Курьер', admin:'Администратор' };
let mode = 'login';

function say(id, text, kind){ const el = $(id); el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
function busy(btn, on){ btn.disabled = on; }

function setMode(m){
  mode = m;
  $('tab-login').setAttribute('aria-selected', m === 'login');
  $('tab-reg').setAttribute('aria-selected', m === 'register');
  $('reg-only').hidden = m === 'login';
  $('auth-submit').textContent = m === 'login' ? 'Войти' : 'Зарегистрироваться';
  $('f-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  say('auth-msg', '');
}

function showAuthed(on){
  $('auth').hidden = on; $('app').hidden = !on; $('logout').hidden = !on;
}

function logout(){
  session.setToken(null);
  showAuthed(false); say('auth-msg', '');
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

function fillProfile(u){
  $('role-line').textContent = 'Роль: ' + (roleNames[u.role] || u.role);
  $('p-name').value = u.name || ''; $('p-email').value = u.email || ''; $('p-phone').value = u.phone || '';
}

async function enterApp(user){
  showAuthed(true);
  if (user) fillProfile(user);
  try { fillProfile(await Api.me()); } catch (e) { if (session.token) say('profile-msg', e.message, 'err'); }
  loadAddresses();
}

async function saveProfile(){
  const btn = $('profile-save'); busy(btn, true); say('profile-msg', '');
  try {
    fillProfile(await Api.updateMe({ name: $('p-name').value.trim(), email: $('p-email').value.trim(), phone: $('p-phone').value.trim() }));
    say('profile-msg', 'Профиль сохранён', 'ok');
  } catch (e) { say('profile-msg', e.message, 'err'); }
  finally { busy(btn, false); }
}

function addrLine(a){
  return [a.city, 'ул. ' + a.street, 'д. ' + a.house, a.apartment ? 'кв. ' + a.apartment : null].filter(Boolean).join(', ');
}

function renderAddresses(list){
  const box = $('addr-list'); box.textContent = '';
  if (!list || !list.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Адресов пока нет. Добавьте первый ниже.'; box.append(p); return; }
  for (const a of list) {
    const row = document.createElement('div'); row.className = 'addr';
    const info = document.createElement('div');
    const t = document.createElement('div'); t.textContent = addrLine(a);
    if (a.is_default) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'основной'; t.append(b); }
    info.append(t);
    if (a.comment) { const s = document.createElement('small'); s.textContent = a.comment; info.append(s); }
    const acts = document.createElement('div'); acts.style.cssText = 'display:flex;gap:6px;align-items:start';
    const edit = document.createElement('button'); edit.textContent = 'Изменить'; edit.disabled = true; edit.title = 'Бэкенд пока не поддерживает';
    const del = document.createElement('button'); del.textContent = 'Удалить';
    del.onclick = () => removeAddress(a.id, del);
    acts.append(edit, del);
    row.append(info, acts); box.append(row);
  }
}

async function loadAddresses(){
  say('addr-msg', '');
  try { renderAddresses(await Api.addresses()); }
  catch (e) { $('addr-list').textContent = ''; say('addr-msg', e.message, 'err'); }
}

async function addAddress(){
  const city = $('a-city').value.trim(), street = $('a-street').value.trim(), house = $('a-house').value.trim();
  if (!city || !street || !house) return say('addr-add-msg', 'Заполните город, улицу и дом', 'err');
  const body = { city, street, house, is_default: $('a-default').checked };
  const apt = $('a-apt').value.trim(), com = $('a-comment').value.trim();
  if (apt) body.apartment = apt; if (com) body.comment = com;
  const btn = $('addr-add'); busy(btn, true); say('addr-add-msg', '');
  try {
    await Api.addAddress(body);
    ['a-city','a-street','a-house','a-apt','a-comment'].forEach(i => $(i).value = ''); $('a-default').checked = false;
    say('addr-add-msg', 'Адрес добавлен', 'ok');
    loadAddresses();
  } catch (e) { say('addr-add-msg', e.message, 'err'); }
  finally { busy(btn, false); }
}

async function removeAddress(id, btn){
  busy(btn, true);
  try { await Api.delAddress(id); loadAddresses(); }
  catch (e) { busy(btn, false); say('addr-msg', e.status === 404 ? 'Адрес уже удалён' : e.message, 'err'); if (e.status === 404) loadAddresses(); }
}

/* ===================== init ===================== */
$('f-api').value = session.base;
session.onUnauthorized = logout;
$('f-api').addEventListener('change', e => { session.setBase(e.target.value); });
$('tab-login').onclick = () => setMode('login');
$('tab-reg').onclick = () => setMode('register');
$('auth-submit').onclick = onAuth;
$('f-pass').addEventListener('keydown', e => { if (e.key === 'Enter') onAuth(); });
$('logout').onclick = logout;
$('profile-save').onclick = saveProfile;
$('addr-add').onclick = addAddress;

if (session.token) enterApp(); else showAuthed(false);
