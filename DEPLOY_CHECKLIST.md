# ✅ Чеклист перед деплоем на Railway

## Файлы проекта

- [ ] `client/index.html` — `window.SOCKET_URL = window.location.origin`
- [ ] `client/styles.css` — существует
- [ ] `client/main.js` — существует
- [ ] `client/webrtc.js` — существует
- [ ] `client/socket.js` — существует
- [ ] `client/ui.js` — существует
- [ ] `client/chat.js` — существует
- [ ] `client/name-generator.js` — существует
- [ ] `server/server.js` — существует, CORS настроен на `origin: true` для production
- [ ] `server/rooms.js` — существует (логика комнат)
- [ ] `server/package.json` — express и socket.io в dependencies
- [ ] `server/nixpacks.toml` — инструкция сборки Nixpacks
- [ ] `railway.json` — в корне проекта, содержит `rootDirectory: "server"`
- [ ] **Удалить лишние файлы:**
  - [ ] `server/Procfile` — не нужен (используется Nixpacks)
  - [ ] `server/railway.json` — дубликат, используется только корневой

## GitHub

- [ ] Код загружен в репозиторий
- [ ] `.gitignore` исключает `node_modules/` и `.env`
- [ ] README.md существует

## Railway

- [ ] Проект создан через "Deploy from GitHub"
- [ ] Root Directory: (пусто — переопределится из `railway.json`)
- [ ] Start Command: `node server.js` (переопределится из `railway.json`)
- [ ] Переменные окружения добавлены:
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` **не задавать** — Railway передаёт порт сам (пользовательская переменная сломает маршрутизацию)
  - [ ] `STUN_SERVERS`/`TURN_*` не задавать — сервер их не читает (ICE в `client/webrtc.js`)

## После деплоя

- [ ] Статус деплоя: "SUCCESS"
- [ ] Приложение открывается по Railway URL
- [ ] Создание комнаты работает
- [ ] Вход по коду работает
- [ ] Видео передаётся (тест в 2 вкладках)
- [ ] Аудио работает
- [ ] Чат отправляет сообщения
- [ ] Демонстрация экрана работает
- [ ] В консоли браузера нет ошибок CORS

## Если что-то не работает

1. **404 на файлах**: Проверьте пути в `index.html`
2. **CORS ошибка**: Проверьте `server.js` — `origin: true` для production
3. **WebSocket не подключается**: Проверьте `window.SOCKET_URL` в `index.html`
4. **WebRTC не работает**: Убедитесь, что HTTPS используется
