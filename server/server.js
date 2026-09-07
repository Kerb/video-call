const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // В production разрешаем все origins (клиент и сервер на одном домене)
    origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Хранение комнат: Map<code, Map<sessionId, {socketId, name}>>
const rooms = new Map();

// Таймеры для очистки пустых комнат: Map<code, setTimeout>
const roomTimers = new Map();

// Очистка комнаты из памяти
function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room && room.size === 0) {
    rooms.delete(roomCode);
    const timer = roomTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      roomTimers.delete(roomCode);
    }
    console.log(`[Room] ${roomCode} cleaned up`);
  }
}

// Запуск таймера очистки для пустой комнаты
function scheduleRoomCleanup(roomCode) {
  const timer = setTimeout(() => {
    cleanupRoom(roomCode);
  }, 60 * 60 * 1000); // 60 минут
  roomTimers.set(roomCode, timer);
  console.log(`[Room] ${roomCode} scheduled for cleanup in 60 minutes`);
}

// Отмена таймера очистки если кто-то вернулся в комнату
function cancelRoomCleanup(roomCode) {
  const timer = roomTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomCode);
    console.log(`[Room] ${roomCode} cleanup cancelled`);
  }
}

// Генерация 6-значного кода комнаты (Base36)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Валидация формата кода комнаты (6 символов, латиница + цифры)
function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/i.test(code);
}

// Обработка подключений Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Создание новой комнаты
  socket.on('create-room', (data) => {
    const { sessionId, name } = data;
    let roomCode;
    let attempts = 0;
    
    // Генерируем уникальный код
    do {
      roomCode = generateRoomCode();
      attempts++;
    } while (rooms.has(roomCode) && attempts < 10);

    if (attempts >= 10) {
      socket.emit('error', { message: 'Не удалось создать комнату. Попробуйте позже.' });
      return;
    }

    // Создаём комнату
    rooms.set(roomCode, new Map());
    console.log(`[Room] Created: ${roomCode}`);

    // Присоединяем создателя к комнате
    const room = rooms.get(roomCode);
    room.set(sessionId, { socketId: socket.id, name });
    socket.join(roomCode);

    // Отправляем код комнаты создателю
    socket.emit('room-created', { 
      roomCode, 
      sessionId,
      participants: Array.from(room.values()).map(p => ({ sessionId: p.sessionId, name: p.name }))
    });

    console.log(`[Room] ${roomCode}: ${sessionId} (${name}) joined as creator`);
  });

  // Вход в существующую комнату
  socket.on('join-room', (data) => {
    const { sessionId, name, roomCode } = data;

    // Валидация формата кода
    if (!isValidRoomCode(roomCode)) {
      socket.emit('error', { 
        message: 'Неверный формат кода. Код должен содержать 6 латинских букв или цифр.' 
      });
      return;
    }

    const room = rooms.get(roomCode.toUpperCase());
    
    // Комната не найдена
    if (!room) {
      socket.emit('error', { 
        message: 'Комната не найдена. Проверьте код или создайте новую комнату.' 
      });
      return;
    }

    // Проверка на переполнение (максимум 5 участников)
    if (room.size >= 5) {
      socket.emit('room-full', { message: 'Комната переполнена. Максимум 5 участников.' });
      return;
    }

    // Присоединяем участника
    room.set(sessionId, { socketId: socket.id, name });
    socket.join(roomCode.toUpperCase());

    // Отправляем подтверждение входа
    socket.emit('room-joined', { 
      roomCode: roomCode.toUpperCase(),
      sessionId,
      participants: Array.from(room.values()).map(p => ({ 
        sessionId: p.sessionId, 
        name: p.name,
        isSelf: p.socketId === socket.id 
      }))
    });

    // Уведомляем остальных участников о новом пользователе
    socket.to(roomCode.toUpperCase()).emit('user-joined', {
      sessionId,
      name
    });

    // Отменяем очистку комнаты если она была запланирована
    cancelRoomCleanup(roomCode.toUpperCase());

    console.log(`[Room] ${roomCode.toUpperCase()}: ${sessionId} (${name}) joined`);
  });

  // Повторный вход в комнату после переподключения
  socket.on('rejoin-room', (data) => {
    const { sessionId, roomCode } = data;
    const normalizedCode = roomCode.toUpperCase();
    const room = rooms.get(normalizedCode);

    if (!room) {
      socket.emit('error', { message: 'Комната не найдена.' });
      return;
    }

    // Восстанавливаем сессию
    room.set(sessionId, { socketId: socket.id, name: room.get(sessionId)?.name || 'Аноним' });
    socket.join(normalizedCode);

    socket.emit('room-rejoined', {
      roomCode: normalizedCode,
      sessionId,
      participants: Array.from(room.values()).map(p => ({ sessionId: p.sessionId, name: p.name }))
    });

    console.log(`[Room] ${normalizedCode}: ${sessionId} rejoined`);
  });

  // Обмен WebRTC сигналами (SDP offer/answer)
  socket.on('offer', (data) => {
    const { targetSocketId, offer, sessionId, roomCode } = data;
    io.to(targetSocketId).emit('offer', {
      offer,
      sessionId,
      fromSocketId: socket.id
    });
  });

  socket.on('answer', (data) => {
    const { targetSocketId, answer, sessionId, roomCode } = data;
    io.to(targetSocketId).emit('answer', {
      answer,
      sessionId,
      fromSocketId: socket.id
    });
  });

  // Обмен ICE кандидатами
  socket.on('ice-candidate', (data) => {
    const { targetSocketId, candidate, sessionId, roomCode } = data;
    io.to(targetSocketId).emit('ice-candidate', {
      candidate,
      sessionId,
      fromSocketId: socket.id
    });
  });

  // Чат сообщения
  socket.on('chat-message', (data) => {
    const { roomCode, sessionId, name, text } = data;
    
    // Рассылаем сообщение всем в комнате
    io.to(roomCode.toUpperCase()).emit('chat-message', {
      sessionId,
      name,
      text,
      timestamp: Date.now()
    });

    console.log(`[Chat] ${roomCode.toUpperCase()}: ${name}: ${text.substring(0, 50)}...`);
  });

  // Индикатор набора текста
  socket.on('typing', (data) => {
    const { roomCode, sessionId, name } = data;
    socket.to(roomCode.toUpperCase()).emit('typing', { sessionId, name });
  });

  // Выход из комнаты
  socket.on('leave-room', (data) => {
    const { sessionId, roomCode } = data;
    const normalizedCode = roomCode.toUpperCase();
    const room = rooms.get(normalizedCode);

    if (room) {
      const participant = room.get(sessionId);
      if (participant) {
        room.delete(sessionId);
        
        // Уведомляем остальных
        io.to(normalizedCode).emit('user-left', { sessionId, name: participant.name });
        console.log(`[Room] ${normalizedCode}: ${sessionId} left`);

        // Если комната пуста - запускаем таймер очистки
        if (room.size === 0) {
          scheduleRoomCleanup(normalizedCode);
        }
      }
    }
  });

  // Отключение клиента
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);

    // Находим и удаляем участника из всех комнат
    for (const [roomCode, room] of rooms.entries()) {
      for (const [sessionId, participant] of room.entries()) {
        if (participant.socketId === socket.id) {
          room.delete(sessionId);
          io.to(roomCode).emit('user-left', { sessionId, name: participant.name });
          console.log(`[Room] ${roomCode}: ${sessionId} disconnected`);

          // Если комната пуста - запускаем таймер очистки
          if (room.size === 0) {
            scheduleRoomCleanup(roomCode);
          }
          break;
        }
      }
    }
  });
});

// Serve static files from client directory in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../client')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`[Server] Signaling server running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
