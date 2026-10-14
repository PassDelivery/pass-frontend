// Адрес бэкенда. Меняется только здесь.
// Локально (localhost) фронт и бэк на разных портах; на сервере nginx отдаёт фронт и проксирует /api/ на бэк,
// поэтому там достаточно относительного пути — без CORS и без IP в коде.
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const API_BASE = local ? 'http://localhost:5050/api/v1' : '/api/v1';
