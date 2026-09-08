// Хранение и логика комнат: генерация кодов, участники, таймеры очистки.
// Модуль ничего не знает о Socket.io — доставка событий остаётся в server.js.

const MAX_PARTICIPANTS = 5;
const MAX_CODE_ATTEMPTS = 10;
const MAX_NAME_LENGTH = 50;
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const ANONYMOUS_NAME = 'Аноним';

// Генерация 6-значного кода комнаты (Base36)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Валидация формата кода комнаты (6 символов, латиница + цифры, регистронезависимо)
function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/i.test(code);
}

// Приведение кода к canonical-виду; для некорректного типа возвращает null
function normalizeRoomCode(code) {
  return typeof code === 'string' ? code.toUpperCase() : null;
}

// Имя участника: только строка разумной длины, иначе "Аноним"
function sanitizeName(name) {
  if (typeof name !== 'string') return ANONYMOUS_NAME;
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || ANONYMOUS_NAME;
}

function listParticipants(room) {
  return Array.from(room.entries()).map(([sessionId, p]) => ({ sessionId, name: p.name }));
}

class RoomStore {
  // ttlMs и generateCode внедряются для тестов
  constructor({ ttlMs = DEFAULT_TTL_MS, generateCode = generateRoomCode } = {}) {
    this.rooms = new Map(); // code -> Map<sessionId, {socketId, name}>
    this.timers = new Map(); // code -> Timeout
    this.ttlMs = ttlMs;
    this.generateCode = generateCode;
  }

  createRoom(sessionId, socketId, name) {
    let roomCode = this.generateCode();
    let attempts = 1;
    while (this.rooms.has(roomCode)) {
      if (attempts >= MAX_CODE_ATTEMPTS) return { error: 'code_conflict' };
      roomCode = this.generateCode();
      attempts++;
    }
    const room = new Map([[sessionId, { socketId, name }]]);
    this.rooms.set(roomCode, room);
    return { roomCode, participants: listParticipants(room) };
  }

  join(roomCode, sessionId, socketId, name) {
    const code = normalizeRoomCode(roomCode);
    if (!code || !isValidRoomCode(code)) return { error: 'bad_code' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'not_found', roomCode: code };
    if (room.size >= MAX_PARTICIPANTS) return { error: 'full', roomCode: code };
    room.set(sessionId, { socketId, name });
    this.cancelCleanup(code);
    return { roomCode: code, participants: listParticipants(room) };
  }

  rejoin(roomCode, sessionId, socketId, name) {
    const code = normalizeRoomCode(roomCode);
    if (!code || !isValidRoomCode(code)) return { error: 'bad_code' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'not_found', roomCode: code };
    // Вернувшийся участник не занимает новое место в полном комнате
    if (!room.has(sessionId) && room.size >= MAX_PARTICIPANTS) return { error: 'full', roomCode: code };
    const previous = room.get(sessionId);
    const finalName = name !== undefined ? sanitizeName(name) : (previous ? previous.name : ANONYMOUS_NAME);
    room.set(sessionId, { socketId, name: finalName });
    this.cancelCleanup(code);
    return { roomCode: code, participants: listParticipants(room), name: finalName };
  }

  leave(roomCode, sessionId) {
    const code = normalizeRoomCode(roomCode);
    const room = code && this.rooms.get(code);
    if (!room) return null;
    const participant = room.get(sessionId);
    if (!participant) return null;
    room.delete(sessionId);
    if (room.size === 0) this.scheduleCleanup(code);
    return { roomCode: code, name: participant.name };
  }

  removeBySocket(socketId) {
    const removed = [];
    for (const [code, room] of this.rooms) {
      for (const [sessionId, participant] of room) {
        if (participant.socketId === socketId) {
          room.delete(sessionId);
          removed.push({ roomCode: code, sessionId, name: participant.name });
          if (room.size === 0) this.scheduleCleanup(code);
          break;
        }
      }
    }
    return removed;
  }

  // Участник комнаты по socketId (для проверки членства и identity отправителя)
  findMember(socketId, roomCode) {
    const code = normalizeRoomCode(roomCode);
    const room = code && this.rooms.get(code);
    if (!room) return null;
    for (const [sessionId, participant] of room) {
      if (participant.socketId === socketId) return { sessionId, name: participant.name };
    }
    return null;
  }

  // Готовит релей offer/answer/ice-candidate от участника комнаты конкретному участнику.
  // Отказывает, если отправитель не в комнате, цели нет или цель — сам отправитель.
  relay(socketId, roomCode, targetSessionId, payload) {
    const code = normalizeRoomCode(roomCode);
    const room = code && this.rooms.get(code);
    if (!room) return null;
    const sender = this.findMember(socketId, code);
    if (!sender) return null;
    const target = room.get(targetSessionId);
    if (!target || target.socketId === socketId) return null;
    return {
      targetSocketId: target.socketId,
      payload: { ...payload, fromSessionId: sender.sessionId, name: sender.name }
    };
  }

  scheduleCleanup(code) {
    this.cancelCleanup(code);
    const timer = setTimeout(() => this.cleanup(code), this.ttlMs);
    this.timers.set(code, timer);
  }

  cancelCleanup(code) {
    const timer = this.timers.get(code);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(code);
    }
  }

  cleanup(code) {
    this.timers.delete(code);
    const room = this.rooms.get(code);
    if (room && room.size === 0) {
      this.rooms.delete(code);
      return true;
    }
    return false;
  }
}

module.exports = {
  RoomStore,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  sanitizeName,
  MAX_PARTICIPANTS
};
