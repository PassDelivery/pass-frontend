/* PassDelivery — отзывы: звёзды, сводка рейтинга и список (страница ресторана, кабинет владельца) */

export const starsText = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

const reviewsWord = (n) => n % 10 === 1 && n % 100 !== 11 ? 'отзыв' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'отзыва' : 'отзывов';

// «★ 4,5 · 12 отзывов» или '' если отзывов нет
export function ratingSummary(reviews){
  if (!reviews?.length) return '';
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return '★ ' + avg.toFixed(1).replace('.', ',') + ' · ' + reviews.length + ' ' + reviewsWord(reviews.length);
}

export function reviewCard(r){
  const card = document.createElement('article'); card.className = 'rv-card';
  const head = document.createElement('div'); head.className = 'rv-card__head';
  const who = document.createElement('strong'); who.textContent = r.author_name || 'Покупатель';
  const stars = document.createElement('span'); stars.className = 'rv-stars'; stars.textContent = starsText(r.rating);
  stars.setAttribute('aria-label', 'Оценка ' + r.rating + ' из 5');
  const when = document.createElement('span'); when.className = 'rv-card__date';
  when.textContent = new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  head.append(who, stars, when);
  card.append(head);
  if (r.body) { const p = document.createElement('p'); p.textContent = r.body; card.append(p); }
  return card;
}

export function renderReviewList(box, reviews){
  box.textContent = '';
  for (const r of reviews) box.append(reviewCard(r));
}
