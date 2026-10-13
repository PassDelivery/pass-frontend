/* PassDelivery — общие мелочи интерфейса */
export const $ = (id) => document.getElementById(id);

// Страницы внутри экрана покупателя: catalog | restaurant | cart | profile
export function showPage(name){
  document.querySelectorAll('#shell [data-page]').forEach(p => { p.hidden = p.dataset.page !== name; });
}

export function say(id, text, kind){ const el = $(id); el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
export function busy(btn, on){ btn.disabled = on; }

// Для 400 бэк кладёт текст валидации в error, а в message — общий заголовок
export function errText(e){ return e.status === 400 && e.body?.error ? e.body.error : e.message; }

export function initials(name){
  return (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '·';
}

const rubWhole = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const rubCents = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 });
export const price = (kopecks) => (kopecks % 100 ? rubCents : rubWhole).format(kopecks / 100);

// Пока у ресторанов и блюд нет фото — тёплый градиент, стабильный для одного и того же id
const HUES = [8, 16, 24, 32, 40, 48, 56, 0];
export function placeholderBg(id){
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return `linear-gradient(135deg, hsl(${hue} 70% 88%), hsl(${(hue + 25) % 360} 60% 72%))`;
}
