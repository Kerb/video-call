# Ревью кода и план покрытия тестами — 2026-09-07

Полный отчёт ревью проекта с последующими исправлениями. Статус каждого пункта:
**[fixed]** исправлено в этом проходе, **[open]** осталось в работе, **[note]** наблюдение.

## 1. Критические баги кода

### 1.1. WebRTC-сигналинг не доставлял сообщения участникам — [fixed]

`client/socket.js` отправлял offer/answer/ICE c `targetSocketId: this.app.socket.socket.id` —
**собственным** socket id. Сервер релеил `io.to(targetSocketId)`, то есть возвращал
сообщение отправителю: каждый клиент «звонил сам себе», реальные участники медиа
не получали. В двух вкладках на одной машине баг маскировался ICE-лупбэком
(каждый видел своё видео, подписанное чужим именем).

**Исправление:** клиенты адресуют сигналы по `targetSessionId` пира; сервер
(`server/rooms.js` → `RoomStore.relay`) сам резолвит sessionId адресата в socketId,
проверяет членство отправителя в комнате и помечает релей `fromSessionId`/`name`.
Регресс-тест: `tests/server/signaling.test.mjs` → «offer доставляется адресату…».

### 1.2. Rejoin не восстанавливал звонок — [fixed]

При disconnect сервер удалял участника и рассылал `user-left` (peers закрывали
PeerConnection), но `rejoin-room` не рассылал `user-joined` — соединения не
пересоздавались. Теперь `rejoin-room`: рассылает `user-joined` остальным,
отменяет таймер очистки комнаты, проверяет лимит 5 участников, принимает имя
от клиента. Дополнительно устранён glare: инициатором offer всегда выступает
уже находящийся в комнате участник; при пересоздании pc инициатор выбирается
детерминированно по сравнению sessionId.

### 1.3. Сервер падал от одного некорректного сообщения — [fixed]

`chat-message`/`typing`/`leave-room`/`rejoin-room` вызывали `roomCode.toUpperCase()`
без проверки → TypeError → uncaughtException → crash-loop (restartPolicy ON_FAILURE).
Теперь весь вход нормализуется через `normalizeRoomCode`/`sanitizeName`; имя в релеях
и чате берётся с сервера; текст чата обрезается до 1000 символов; чужие сообщения
не релеятся (проверка членства). Тест: «chat-message … не валит сервер без payload».

### 1.4. XSS через имя участника — [fixed]

`ui.js` вставлял `name` через `innerHTML` в `addLocalVideo`/`addRemoteVideo`/
`addChatMessage` (escape был только для текста чата). Имя — свободный ввод,
рассылаемый всем участникам: `<img src=x onerror=…>` исполнялся у всех.
Теперь имена и label устройств вставляются через `textContent`/`escapeHtml`.
Тесты: `tests/client/ui.test.mjs` (XSS-регрессии).

### 1.5. Дублирование обработчиков при повторном входе — [fixed]

`setupRoomControls` вызывался при каждом входе в комнату и навешивал
`addEventListener` на те же узлы: после «выйти → войти» mute-кнопка работала
дважды (визуально ломалась), `confirm` показывался два раза. Теперь привязка
однократная (`controlsBound`).

## 2. Прочие исправления этого прохода — [fixed]

- `leave-room` теперь вызывает `socket.leave()`: вышедший не получает события комнаты.
- Off-by-one в генерации кода комнаты (10-я удачная попытка ошибочно отвергалась).
- `client/socket.js`: убран `process.env.SOCKET_URL` (ReferenceError в браузере) и
  остаточный комментарий про Vercel; фабрика `io` внедряется для тестов.
- `index.html`: dev-фолбэк `SOCKET_URL` — локальный клиент на `:3000` подключается
  к серверу на `:3001` (раньше быстрый старт из README не работал вовсе).
- Убран дублирующий `require('path')` в server.js.
- Сервер отрефакторен: логика комнат выделена в `server/rooms.js` (RoomStore),
  сервер собирается фабрикой `createSignalingServer()`, `listen` — только при
  прямом запуске (`require.main === module`).

## 3. Осталось открытым — [open]

- CORS `origin: true` + `credentials: true` для production: для same-origin
  деплоя CORS-конфигурацию можно убрать совсем.
- Индикация активного говорящего (Web Audio API) — не реализована, помечена
  в tasks.md 5.5.
- История чата для вошедших позже — не хранится (спека chat требует).
- Заглушка при выключенном видео у остальных участников — не реализована.
- `window.onerror`, обработчики online/offline — отсутствуют (tasks.md 8.9, 7.5).
- Спека room-management: «код не повторяется 24 часа» — фактически коды
  уникальны только среди активных комнат.
- `main.js` не покрыт unit-тестами: модуль выполняет `app.init()` при импорте;
  нужен рефакторинг с DI.
- openspec: изменение `browser-video-call` не заархивировано (`openspec/specs/`
  пуст) — выполнить `openspec archive browser-video-call`.
- Гигиена репозитория: артефакты AI-агентов (`.qwen/`, `.opencode/`) в git.

## 4. Несоответствия документации (исправлены — [fixed])

| Документ | Было | Стало |
|---|---|---|
| README | Быстрый старт неработоспособен (клиент ходил за сокетом на `:3000`) | Dev-фолбэк в `index.html`, инструкция соответствует коду |
| README | Раздел «Конфигурация» описывал `CLIENT_URL`/`STUN_SERVERS`/`TURN_*` — сервер их не читает; `.env` не загружается (нет dotenv) | Честная таблица: только `PORT`/`NODE_ENV`; примечание про `.env` |
| README | Структура проекта устарела | Актуальное дерево, включая `rooms.js`, `tests/`, `railway.json` |
| DEPLOY_RAILWAY / CHECKLIST | Советовали задать `PORT=3001` в Railway Variables — это ломает маршрутизацию (порт инжектит платформа) | Явное «не задавать PORT/STUN» |
| DEPLOY_RAILWAY | `nixpacks.toml` показан в корне; конфликт `rootDirectory` + `workingDirectory: "server"` (→ несуществующий `server/server`) | Структура исправлена; `workingDirectory` убран из nixpacks.toml |
| .env.example | Самопротиворечие («Railway устанавливает PORT, не меняйте» + `PORT=3001`) и мёртвые переменные | Переписан честно |
| tasks.md | Галочки `[x]` на нереализованном: HTTPS для dev (1.4), `addStream/removeStream` (3.1), говорящий (5.5), офлайн (7.5), `window.onerror` (8.9) | Сняты с пометками; добавлен раздел 10 с фиксами ревью |
| design.md | «Сервер Stateless — не хранит состояние» противоречил решению 4; формат `Map<code, Set<socketId>>` не соответствовал коду | Устранено |

Примечание: `healthcheckTimeout` в `railway.json` измеряется в **секундах**
(Railway docs: Config as Code), значение 100 — допустимое, но долгое.

## 5. План и статус покрытия тестами

Инфраструктура: **Vitest** в корне репозитория (сервер — node-окружение,
клиент — jsdom со стабами `RTCPeerConnection`/`navigator.mediaDevices`);
интеграционные тесты signaling-а поднимают реальный Socket.io сервер и
`socket.io-client`. Запуск: `npm test` / `npm run test:coverage`.

Статус по модулям (104 теста, все зелёные):

| Модуль | Тесты | Покрытие строк | Ключевые сценарии |
|---|---|---|---|
| `server/rooms.js` | юнит | 99% | коды комнат, лимит 5, ttl-очистка, relay по sessionId, rejoin, off-by-one |
| `server/server.js` | интеграц. | 92% | полный цикл событий socket.io, устойчивость к битым payload, production-статика |
| `client/socket.js` | юнит | 100% | адресация сигналов (регресс 1.1), reconnect/rejoin, обработчики событий |
| `client/ui.js` | юнит (jsdom) | 83% | XSS-регрессии имён/текста, дубль-обработчики (регресс 1.5), модалки, toast |
| `client/webrtc.js` | юнит (стабы) | 70% | offer/answer flow, буферизация ICE, screen share, toggle треков, glare-детерминизм |
| `client/chat.js` | юнит (jsdom) | 95% | лимит 1000, пустые сообщения, typing-throttle, self-фильтр |
| `client/name-generator.js` | юнит | 100% | формат, уникальность, fallback |
| `client/main.js` | — | 0% | [open] нужен DI-рефакторинг (side effects при импорте) |

Следующие уровни (не реализовано): E2E на Playwright с двумя контекстами и
Chrome-флагами `--use-fake-device-for-media-stream` (смоук: комната + чат +
появление удалённого видео); CI (GitHub Actions) с гейтом покрытия.
