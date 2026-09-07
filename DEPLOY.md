# Деплой приложения

## Вариант 1: Фронтенд на Vercel + Сервер на Railway

### Шаг 1: Деплой сервера на Railway

1. Создайте репозиторий на GitHub с кодом
2. Зайдите на [railway.app](https://railway.app)
3. Нажмите "New Project" → "Deploy from GitHub repo"
4. Выберите ваш репозиторий
5. В настройках укажите:
   - **Root Directory**: `server`
   - **Start Command**: `node server.js`
6. Добавьте переменные окружения:
   - `PORT`: `3001` (автоматически задаётся Railway)
   - `CLIENT_URL`: `https://your-app.vercel.app` (ваш фронтенд на Vercel)
7. Railway автоматически выдаст URL вида `https://your-app-production.up.railway.app`

### Шаг 2: Деплой клиента на Vercel

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите "Add New" → "Project"
3. Импортируйте ваш GitHub репозиторий
4. В настройках укажите:
   - **Framework Preset**: `Other`
   - **Root Directory**: `client`
   - **Build Command**: (оставьте пустым)
   - **Output Directory**: (оставьте пустым)
5. Добавьте переменные окружения:
   - `SOCKET_URL`: `https://your-app-production.up.railway.app` (URL из Railway)
6. Нажмите "Deploy"

### Шаг 3: Настройка CORS

В `server/server.js` убедитесь, что CORS настроен правильно:

```javascript
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});
```

На Railway в переменных окружения укажите `CLIENT_URL` с вашим Vercel URL.

### Шаг 4: Обновите URL сервера в клиенте

В `client/index.html` замените:

```javascript
window.SOCKET_URL = 'https://your-app-production.up.railway.app';
```

Или используйте Environment Variables в Vercel.

---

## Вариант 2: Всё на Render.com

Render поддерживает Node.js приложения со статическими файлами.

### Шаг 1: Создайте `render.yaml` в корне проекта

```yaml
services:
  - type: web
    name: browser-video-call
    env: node
    buildCommand: cd server && npm install
    startCommand: cd server && node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: CLIENT_URL
        value: https://your-app.onrender.com
```

### Шаг 2: Деплой на Render

1. Зайдите на [render.com](https://render.com)
2. "New +" → "Blueprint"
3. Подключите GitHub репозиторий
4. Render автоматически распознает `render.yaml`
5. Нажмите "Apply"

---

## Вариант 3: Фронтенд на Vercel + Сервер на VPS

### VPS деплой (Ubuntu/Debian)

```bash
# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PM2
sudo npm install -g pm2

# Копирование файлов сервера
scp -r server/ user@your-vps:/var/www/videocall-server
cd /var/www/videocall-server

# Установка зависимостей
npm install

# Запуск через PM2
pm2 start server.js --name videocall
pm2 save
pm2 startup

# Настройка Nginx
sudo nano /etc/nginx/sites-available/videocall
```

Конфигурация Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Включение сайта и перезапуск Nginx
sudo ln -s /etc/nginx/sites-available/videocall /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# HTTPS через Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Проверка работы

1. Откройте `https://your-app.vercel.app`
2. Создайте комнату
3. Отправьте код другу
4. Проверьте соединение

## Troubleshooting

### Ошибка CORS
- Убедитесь, что `CLIENT_URL` на сервере совпадает с URL фронтенда
- Проверьте настройки CORS в `server.js`

### WebSocket не подключается
- Убедитесь, что сервер поддерживает WebSocket (Railway/Render поддерживают)
- Проверьте firewall на VPS (порт 3001 должен быть открыт)

### WebRTC не работает
- Требуется HTTPS (на Vercel автоматически, на сервере настройте SSL)
- Проверьте STUN/TURN серверы в `webrtc.js`
