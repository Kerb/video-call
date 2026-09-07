# 🚀 Деплой на Railway

Пошаговая инструкция по деплою сервера VideoCall на Railway.

## Предварительные требования

- Аккаунт на GitHub
- Аккаунт на [Railway.app](https://railway.app)
- Код проекта загружен в GitHub репозиторий

---

## Шаг 1: Подготовка сервера

### 1.1 Проверьте файлы

Убедитесь, что в папке `server/` есть:
- ✅ `package.json` — с зависимостями express и socket.io
- ✅ `server.js` — основной файл сервера
- ✅ `.env.example` — шаблон переменных окружения

### 1.2 Файлы для Railway (уже созданы)

- `railway.json` — конфигурация деплоя
- `nixpacks.toml` — инструкция сборки для Railway

---

## Шаг 2: Деплой на Railway

### 2.1 Создание проекта

1. Зайдите на [railway.app](https://railway.app)
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Авторизуйтесь через GitHub (если нужно)
5. Найдите и выберите ваш репозиторий с проектом

### 2.2 Настройка сервиса

1. Railway автоматически обнаружит `server/` папку
2. Если нет — нажмите на сервис → **"Settings"** → **"Root Directory"** → укажите `server`

### 2.3 Переменные окружения

В разделе **"Variables"** добавьте:

| Ключ | Значение |
|------|----------|
| `NODE_ENV` | `production` |
| `CLIENT_URL` | `https://your-app.vercel.app` (ваш фронтенд) |
| `STUN_SERVERS` | `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302` |

> **Примечание:** `PORT` не нужно указывать — Railway автоматически задаёт эту переменную.

### 2.4 Запуск деплоя

1. Перейдите на вкладку **"Deployments"**
2. Railway автоматически запустит сборку
3. Дождитесь завершения (статус **"SUCCESS"**)
4. Скопируйте URL сервиса (вида `https://your-project-production.up.railway.app`)

---

## Шаг 3: Настройка фронтенда

### 3.1 Обновите URL сервера

В файле `client/index.html` найдите и замените:

```javascript
window.SOCKET_URL = 'https://YOUR_RAILWAY_URL.up.railway.app';
```

Вставьте ваш URL из Railway.

### 3.2 Деплой фронтенда на Vercel

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите **"Add New"** → **"Project"**
3. Импортируйте ваш GitHub репозиторий
4. Настройки:
   - **Framework Preset**: `Other`
   - **Root Directory**: `client`
   - **Build Command**: (оставьте пустым)
5. Нажмите **"Deploy"**

### 3.3 Настройте CORS на Railway

Вернитесь в Railway и обновите переменную:

| Ключ | Значение |
|------|----------|
| `CLIENT_URL` | `https://your-app.vercel.app` (новый URL из Vercel) |

Railway автоматически перезапустит сервер с новыми настройками.

---

## Шаг 4: Проверка работы

### 4.1 Откройте фронтенд

Перейдите на `https://your-app.vercel.app`

### 4.2 Создайте тестовую комнату

1. Нажмите **"Создать комнату"**
2. Скопируйте код комнаты
3. Откройте другую вкладку/браузер
4. Введите код и нажмите **"Войти в комнату"**

### 4.3 Проверьте соединение

- ✅ Видео и аудио работают
- ✅ Чат отправляет сообщения
- ✅ Демонстрация экрана работает

---

## Troubleshooting

### Ошибка CORS

**Симптомы:** В консоли ошибка "CORS policy" или "Access-Control-Allow-Origin"

**Решение:**
1. Проверьте `CLIENT_URL` в Railway — должен точно совпадать с URL на Vercel
2. Убедитесь, что нет trailing slash (`https://app.vercel.app` ✅, `https://app.vercel.app/` ❌)
3. Перезапустите сервер в Railway (Deployments → Redeploy)

### WebSocket не подключается

**Симптомы:** Бесконечное "Подключение к комнате..."

**Решение:**
1. Проверьте `SOCKET_URL` в `client/index.html`
2. Убедитесь, что URL начинается с `https://`
3. Проверьте консоль браузера на ошибки

### WebRTC не работает (чёрный экран вместо видео)

**Симптомы:** Видео не передаётся между участниками

**Решение:**
1. Убедитесь, что браузер разрешил доступ к камере/микрофону
2. Проверьте, что соединение HTTPS (требуется для WebRTC)
3. Попробуйте добавить TURN-сервер (см. ниже)

---

## Добавление TURN-сервера (опционально)

Если ~10-20% пользователей не могут подключиться (за симметричным NAT), добавьте TURN:

### 1. Развёртывание coturn на Railway

1. Создайте новый проект на Railway для TURN
2. Используйте Docker-образ: `coturn/coturn`
3. Настройте переменные:
   - `TURN_USERNAME`: `videocall`
   - `TURN_PASSWORD`: `<secure-password>`
   - `TURN_REALM`: `videocall`

### 2. Добавьте TURN в сервер

В Railway (сервер) добавьте переменные:

```env
TURN_SERVERS=turn:your-turn-project-production.up.railway.app:3478
TURN_USERNAME=videocall
TURN_PASSWORD=<secure-password>
```

### 3. Обновите `server/server.js`

Добавьте TURN в конфигурацию ICE серверов (отправляется клиентам через signaling).

---

## Мониторинг и логи

### Просмотр логов

1. Railway Dashboard → Ваш проект → **"Logs"**
2. Фильтруйте по уровню (INFO, ERROR)
3. Ищите сообщения `[Server]`, `[Socket]`, `[Room]`

### Перезапуск сервера

- **Автоматически**: Railway перезапустит при падении
- **Вручную**: Deployments → **"Redeploy"**

### Масштабирование

Railway автоматически масштабирует при нагрузке. Для ручного управления:
- Settings → **"Scaling"** → Выберите план (Hobby/Pro)

---

## Стоимость

- **Hobby план**: $5/месяц, 500 часов работы
- **Pro план**: $20/месяц, неограниченно

Для небольшого проекта достаточно Hobby плана.

---

## Полезные ссылки

- [Railway Docs](https://docs.railway.app)
- [Railway Pricing](https://railway.app/pricing)
- [Nixpacks Docs](https://nixpacks.com)
