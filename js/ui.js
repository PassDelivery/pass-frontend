/* PassDelivery — общие мелочи интерфейса */
import { API_BASE } from './config.js';

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

/* ---------- фото ресторанов и блюд ---------- */
// photo_url с бэка — путь вида /uploads/dishes/<имя>.jpg относительно API
export const photoSrc = (url) => url ? API_BASE + url : '';

// Фото поверх заглушки: пока картинка грузится или если её нет — градиент (seed) или фон из CSS (seed = null)
export function paintPhoto(el, url, seed){
  el.dataset.photo = url || '';
  el.classList.remove('has-photo');
  el.style.background = seed == null ? '' : placeholderBg(seed);
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    if (el.dataset.photo !== url) return;   // элемент уже показывает другое фото
    el.style.background = 'center / cover no-repeat url("' + img.src + '")';
    el.classList.add('has-photo');
  };
  img.src = photoSrc(url);
}

// Уменьшаем фото в браузере до 1200 px по длинной стороне и пережимаем в JPEG:
// телефонные снимки по 5–8 МБ превращаются в ~200–400 КБ и грузятся быстро
export async function shrinkPhoto(file, max = 1200){
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error('Не удалось открыть файл — выберите фото в формате JPG, PNG или WebP'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => b ? resolve(b) : reject(new Error('Не удалось обработать фото')), 'image/jpeg', 0.85));
}
