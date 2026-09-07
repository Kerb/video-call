# 🚀 Деплой на Railway — Полная инструкция

Размещение **и клиента, и сервера** на Railway в одном проекте.

---

## Архитектура

```
┌─────────────────────────────────────┐
│         Railway Project             │
│  https://your-app.up.railway.app    │
├─────────────────────────────────────┤
│  /server  → Node.js + Socket.io     │
│  /client  → Статические файлы       │
└─────────────────────────────────────┘
```

Сервер отдаёт статические файлы клиента через Express.

**Преимущества:**
- ✅ Один проект вместо двух
- ✅ Нет CORS проблем (клиент и сервер на одном домене)
- ✅ HTTPS автоматически
- ✅ Автоматический деплой при git push

---

## Шаг 1: Подготовка

### 1.1 Проверьте структуру

```
project/
├── client/           # Фронтенд
│   ├── index.html
│   ├── styles.css
│   ├── main.js
│   ├── webrtc.js
│   ├── socket.js
│   ├── ui.js
│   ├── chat.js
│   └── name-generator.js
├── server/           # Сервер
│   ├── server.js
│   └── package.json
├── railway.json      # Конфиг Railway
├── nixpacks.toml     # Инструкция сборки
└── README.md
```

### 1.2 Файлы для Railway (уже созданы)

- ✅ `railway.json` — конфигурация деплоя
- ✅ `nixpacks.toml` — инструкция сборки

---

## Шаг 2: Загрузка на GitHub

1. Создайте репозиторий на GitHub
2. Загрузите все файлы проекта
3. Убедитесь, что `.gitignore` исключает `node_modules/` и `.env`

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

---

## Шаг 3: Деплой на Railway

### 3.1 Создание проекта

1. Зайдите на [railway.app](https://railway.app)
2. Нажмите **"New Project"**
3. Выберите **"Deploy from GitHub repo"**
4. Авторизуйтесь через GitHub
5. Найдите и выберите ваш репозиторий

### 3.2 Настройка

Railway автоматически распознает `nixpacks.toml` из корня проекта.

**Проверьте настройки:**
- **Root Directory**: (оставьте пустым — используется корень)
- **Start Command**: `node server/server.js`

### 3.3 Переменные окружения

В разделе **"Variables"** добавьте:

| Ключ | Значение |
|------|----------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` (Railway может переопределить) |
| `STUN_SERVERS` | `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302` |

> **Примечание:** `CLIENT_URL` не нужен — сервер и клиент на одном домене.

### 3.4 Запуск деплоя

1. Перейдите на вкладку **"Deployments"**
2. Railway запустит сборку автоматически
3. Дождитесь статуса **"SUCCESS"**
4. Скопируйте URL проекта (вида `https://your-project-production.up.railway.app`)

---

## Шаг 4: Проверка работы

### 4.1 Откройте приложение

Перейдите по вашему Railway URL.

### 4.2 Тестирование

1. Нажмите **"Создать комнату"**
2. Скопируйте код комнаты
3. Откройте другую вкладку браузера
4. Введите код и нажмите **"Войти в комнату"**
5. Проверьте:
   - ✅ Видео работает
   - ✅ Аудио работает
   - ✅ Чат отправляет сообщения
   - ✅ Демонстрация экрана работает

---

## Как это работает

### Сервер отдаёт статику

В production режиме (`NODE_ENV=production`) сервер Express:

```javascript
// Раздаёт статические файлы из /client
app.use(express.static(path.join(__dirname, '../client')));

// Все запросы перенаправляет на index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});
```

### Клиент подключается к тому же домену

```javascript
// SOCKET_URL = текущий домен
window.SOCKET_URL = window.location.origin;
```

Это означает, что если вы зашли на `https://app.up.railway.app`, клиент подключится к `https://app.up.railway.app` — там же, где сервер.

---

## Обновление приложения

```bash
# Внесите изменения в код
git add .
git commit -m "Update feature"
git push
```

Railway автоматически перезапустит деплой при каждом push в GitHub.

---

## Troubleshooting

### 404 на статических файлах

**Проблема:** `index.html` загружается, но CSS/JS не находятся

**Решение:**
1. Проверьте пути в `index.html`:
   ```html
   <link rel="stylesheet" href="styles.css">
   <script src="/socket.io/socket.io.js"></script>
   ```
2. Убедитесь, что все файлы в папке `client/`
3. Проверьте логи Railway на ошибки

### WebSocket не подключается

**Проблема:** Бесконечное "Подключение к комнате..."

**Решение:**
1. Проверьте консоль браузера (F12)
2. Убедитесь, что `window.SOCKET_URL` установлен правильно
3. Проверьте, что сервер запущен (логи Railway)

### CORS ошибка

**Проблема:** Ошибка "Access-Control-Allow-Origin"

**Решение:**
1. Проверьте `server.js` — CORS должен разрешать текущий домен:
   ```javascript
   const io = new Server(server, {
     cors: {
       origin: true, // Разрешить все origins (для production)
       methods: ['GET', 'POST']
     }
   });
   ```
2. Или укажите конкретный домен:
   ```javascript
   origin: 'https://your-app.up.railway.app'
   ```

### WebRTC не работает

**Проблема:** Чёрный экран вместо видео

**Решение:**
1. Убедитесь, что HTTPS используется (Railway автоматически)
2. Разрешите доступ к камере/микрофону в браузере
3. Проверьте консоль на ошибки WebRTC

---

## Добавление TURN-сервера

Если пользователи за симметричным NAT не могут подключиться:

### 1. Разверните coturn на отдельном Railway проекте

1. Создайте новый проект Railway
2. Используйте Docker-образ `coturn/coturn`
3. Настройте переменные TURN

### 2. Добавьте TURN в основной проект

В Railway Variables:

```env
TURN_SERVERS=turn:your-turn-project.up.railway.app:3478
TURN_USERNAME=videocall
TURN_PASSWORD=<secure-password>
```

### 3. Обновите `server/server.js`

Передавайте TURN конфигурацию клиентам через signaling.

---

## Мониторинг

### Логи

Railway Dashboard → Проект → **"Logs"**

Ищите:
- `[Server] Signaling server running on port...`
- `[Socket] Connected...`
- `[Room] Created...`

### Перезапуск

- **Автоматически**: при падении
- **Вручную**: Deployments → **"Redeploy"**

---

## Стоимость

- **Hobby**: $5/месяц, 500 часов
- **Pro**: $20/месяц, без ограничений

Одного проекта Hobby достаточно для небольшого приложения.

---

## Домен (опционально)

### Кастомный домен на Railway

1. Railway Dashboard → Проект → **"Settings"**
2. **"Domains"** → **"Add Domain"**
3. Введите ваш домен
4. Настройте DNS (CNAME запись)
5. Railway автоматически выдаст SSL-сертификат

---

## Полезные ссылки

- [Railway Docs](https://docs.railway.app)
- [Nixpacks Docs](https://nixpacks.com)
- [Railway Variables](https://docs.railway.app/develop/variables)
