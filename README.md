# PassDelivery — web

Минимальный клиент для Pass Core API (auth, профиль, адреса). Без сборки и зависимостей.

## Запуск

ES-модули не работают с `file://`, нужен любой статический сервер:

```bash
cd passdelivery
python3 -m http.server 5173   # или: npx serve .
```

Откройте http://localhost:5173. Адрес бэкенда по умолчанию — `http://localhost:5050`
(меняется на экране входа в блоке «Адрес API»). На бэке должен быть включён CORS
для origin фронтенда (`Authorization`, `Content-Type`, методы `PATCH`, `DELETE`).

## Структура

- `index.html` — разметка
- `css/styles.css` — стили
- `js/api.js` — сессия и все ручки (`Api.*`)
- `js/app.js` — интерфейс

## TODO

- `PATCH /users/me/addresses/{id}` — когда появится на бэке
