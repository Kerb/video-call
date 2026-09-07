# ✅ Чеклист перед деплоем

## Сервер (Railway)

- [ ] `package.json` содержит express и socket.io в dependencies
- [ ] `server.js` существует и запускается без ошибок
- [ ] `railway.json` создан в папке `server/`
- [ ] `nixpacks.toml` создан в папке `server/`
- [ ] `.env.example` содержит все переменные
- [ ] В Railway добавлены переменные:
  - [ ] `NODE_ENV=production`
  - [ ] `CLIENT_URL=https://your-app.vercel.app`
  - [ ] `STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`

## Клиент (Vercel)

- [ ] `index.html` существует
- [ ] `styles.css` существует
- [ ] Все JS-модули подключены (`main.js`, `webrtc.js`, `socket.js`, `ui.js`, `chat.js`, `name-generator.js`)
- [ ] В `index.html` указан правильный Railway URL в `window.SOCKET_URL`
- [ ] `vercel.json` создан (опционально)

## GitHub

- [ ] Код загружен в репозиторий
- [ ] `.gitignore` не включает `node_modules/` и `.env`
- [ ] README.md содержит инструкцию

## После деплоя

- [ ] Сервер на Railway запущен (статус "SUCCESS")
- [ ] Фронтенд на Vercel развёрнут (статус "Ready")
- [ ] CORS настроен (CLIENT_URL на Railway = Vercel URL)
- [ ] Тестовая комната создана
- [ ] Видео и аудио работают в двух вкладках
- [ ] Чат отправляет сообщения
- [ ] Демонстрация экрана работает

## Если что-то не работает

1. Проверьте логи Railway (вкладка "Logs")
2. Проверьте консоль браузера (F12)
3. Убедитесь, что HTTPS используется (требуется для WebRTC)
4. Проверьте переменные окружения на Railway
