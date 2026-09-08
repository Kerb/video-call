const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { RoomStore, sanitizeName } = require('./rooms');

const PORT = process.env.PORT || 3001;
const MAX_MESSAGE_LENGTH = 1000;

function createSignalingServer({ roomStore, serveStatic = process.env.NODE_ENV === 'production' } = {}) {
  const rooms = roomStore || new RoomStore();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      // В production клиент и сервер на одном домене; в dev клиент на :3000
      origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Создание новой комнаты
    socket.on('create-room', (data = {}) => {
      const { sessionId } = data;
      if (typeof sessionId !== 'string' || !sessionId) {
        socket.emit('error', { message: 'Некорректный идентификатор сессии.' });
        return;
      }
      const name = sanitizeName(data.name);
      const result = rooms.createRoom(sessionId, socket.id, name);
      if (result.error) {
        socket.emit('error', { message: 'Не удалось создать комнату. Попробуйте позже.' });
        return;
      }
      socket.join(result.roomCode);
      socket.emit('room-created', {
        roomCode: result.roomCode,
        sessionId,
        participants: result.participants
      });
      console.log(`[Room] Created: ${result.roomCode}`);
      console.log(`[Room] ${result.roomCode}: ${sessionId} (${name}) joined as creator`);
    });

    // Вход в существующую комнату
    socket.on('join-room', (data = {}) => {
      const { sessionId } = data;
      if (typeof sessionId !== 'string' || !sessionId) {
        socket.emit('error', { message: 'Некорректный идентификатор сессии.' });
        return;
      }
      const name = sanitizeName(data.name);
      const result = rooms.join(data.roomCode, sessionId, socket.id, name);
      if (result.error === 'bad_code') {
        socket.emit('error', {
          message: 'Неверный формат кода. Код должен содержать 6 латинских букв или цифр.'
        });
        return;
      }
      if (result.error === 'not_found') {
        socket.emit('error', {
          message: 'Комната не найдена. Проверьте код или создайте новую комнату.'
        });
        return;
      }
      if (result.error === 'full') {
        socket.emit('room-full', { message: 'Комната переполнена. Максимум 5 участников.' });
        return;
      }
      socket.join(result.roomCode);
      socket.emit('room-joined', {
        roomCode: result.roomCode,
        sessionId,
        participants: result.participants.map(p => ({ ...p, isSelf: p.sessionId === sessionId }))
      });
      socket.to(result.roomCode).emit('user-joined', { sessionId, name });
      console.log(`[Room] ${result.roomCode}: ${sessionId} (${name}) joined`);
    });

    // Повторный вход в комнату после переподключения
    socket.on('rejoin-room', (data = {}) => {
      const { sessionId } = data;
      if (typeof sessionId !== 'string' || !sessionId) {
        socket.emit('error', { message: 'Некорректный идентификатор сессии.' });
        return;
      }
      const result = rooms.rejoin(data.roomCode, sessionId, socket.id, data.name);
      if (result.error) {
        if (result.error === 'full') {
          socket.emit('room-full', { message: 'Комната переполнена. Максимум 5 участников.' });
        } else {
          socket.emit('error', { message: result.error === 'bad_code' ? 'Неверный формат кода.' : 'Комната не найдена.' });
        }
        return;
      }
      socket.join(result.roomCode);
      socket.emit('room-rejoined', {
        roomCode: result.roomCode,
        sessionId,
        participants: result.participants.map(p => ({ ...p, isSelf: p.sessionId === sessionId }))
      });
      // Остальные участники пересоздают соединение с вернувшимся
      socket.to(result.roomCode).emit('user-joined', { sessionId, name: result.name });
      console.log(`[Room] ${result.roomCode}: ${sessionId} rejoined`);
    });

    // Релей WebRTC-сигналов: сервер сам резолвит sessionId адресата в socketId,
    // поэтому клиенты не обязаны знать socket id друг друга
    const relay = (event, key) => (data = {}) => {
      const result = rooms.relay(socket.id, data.roomCode, data.targetSessionId, { [key]: data[key] });
      if (!result) return;
      io.to(result.targetSocketId).emit(event, result.payload);
    };
    socket.on('offer', relay('offer', 'offer'));
    socket.on('answer', relay('answer', 'answer'));
    socket.on('ice-candidate', relay('ice-candidate', 'candidate'));

    // Чат: имя и membership берём с сервера, текст ограничен по длине
    socket.on('chat-message', (data = {}) => {
      const sender = rooms.findMember(socket.id, data.roomCode);
      if (!sender) return;
      const text = typeof data.text === 'string' ? data.text.slice(0, MAX_MESSAGE_LENGTH) : '';
      if (!text.trim()) return;
      const roomCode = data.roomCode.toUpperCase();
      io.to(roomCode).emit('chat-message', {
        sessionId: sender.sessionId,
        name: sender.name,
        text,
        timestamp: Date.now()
      });
      console.log(`[Chat] ${roomCode}: ${sender.name}: ${text.substring(0, 50)}`);
    });

    // Индикатор набора текста
    socket.on('typing', (data = {}) => {
      const sender = rooms.findMember(socket.id, data.roomCode);
      if (!sender) return;
      socket.to(data.roomCode.toUpperCase()).emit('typing', { sessionId: sender.sessionId, name: sender.name });
    });

    // Выход из комнаты
    socket.on('leave-room', (data = {}) => {
      const result = rooms.leave(data.roomCode, data.sessionId);
      if (!result) return;
      socket.leave(result.roomCode);
      io.to(result.roomCode).emit('user-left', { sessionId: data.sessionId, name: result.name });
      console.log(`[Room] ${result.roomCode}: ${data.sessionId} left`);
    });

    // Отключение клиента
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const removed = rooms.removeBySocket(socket.id);
      for (const { roomCode, sessionId, name } of removed) {
        io.to(roomCode).emit('user-left', { sessionId, name });
        console.log(`[Room] ${roomCode}: ${sessionId} disconnected`);
      }
    });
  });

  // Serve static files from client directory in production
  if (serveStatic) {
    app.use(express.static(path.join(__dirname, '../client')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/index.html'));
    });
  }

  return { app, server, io, rooms };
}

if (require.main === module) {
  const { server } = createSignalingServer();
  server.listen(PORT, () => {
    console.log(`[Server] Signaling server running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = { createSignalingServer };
