import { describe, it, expect } from 'vitest';
import {
  RoomStore,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  sanitizeName,
  MAX_PARTICIPANTS
} from '../../server/rooms.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('generateRoomCode', () => {
  it('возвращает 6 символов A-Z/0-9', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateRoomCode()).toMatch(/^[A-Z0-9]{6}$/);
    }
  });
});

describe('isValidRoomCode', () => {
  it('принимает корректные коды в любом регистре', () => {
    expect(isValidRoomCode('ABC123')).toBe(true);
    expect(isValidRoomCode('abc123')).toBe(true);
  });

  it('отклоняет некорректные коды', () => {
    expect(isValidRoomCode('ABC12')).toBe(false);
    expect(isValidRoomCode('ABC1234')).toBe(false);
    expect(isValidRoomCode('АБЦ123')).toBe(false);
    expect(isValidRoomCode('ABC 23')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode(undefined)).toBe(false);
    expect(isValidRoomCode(null)).toBe(false);
    expect(isValidRoomCode(123456)).toBe(false);
  });
});

describe('normalizeRoomCode', () => {
  it('приводит к верхнему регистру', () => {
    expect(normalizeRoomCode('abc123')).toBe('ABC123');
  });

  it('возвращает null для не-строк', () => {
    expect(normalizeRoomCode(undefined)).toBe(null);
    expect(normalizeRoomCode(null)).toBe(null);
    expect(normalizeRoomCode(123456)).toBe(null);
    expect(normalizeRoomCode({})).toBe(null);
  });
});

describe('sanitizeName', () => {
  it('обрезает пробелы и длину до 50 символов', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice');
    expect(sanitizeName('x'.repeat(80)).length).toBe(50);
  });

  it('некорректное имя заменяется на Аноним', () => {
    expect(sanitizeName(undefined)).toBe('Аноним');
    expect(sanitizeName(null)).toBe('Аноним');
    expect(sanitizeName(42)).toBe('Аноним');
    expect(sanitizeName('   ')).toBe('Аноним');
  });
});

describe('RoomStore.createRoom', () => {
  it('создаёт комнату с создателем', () => {
    const store = new RoomStore();
    const result = store.createRoom('s1', 'socket-1', 'Alice');
    expect(result.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(result.participants).toEqual([{ sessionId: 's1', name: 'Alice' }]);
    expect(store.rooms.get(result.roomCode).get('s1')).toEqual({ socketId: 'socket-1', name: 'Alice' });
  });

  it('не использует код существующей комнаты', () => {
    let call = 0;
    const store = new RoomStore({ generateCode: () => (call++ === 0 ? 'AAAAAA' : 'BBBBBB') });
    const first = store.createRoom('s1', 'socket-1', 'Alice');
    expect(first.roomCode).toBe('AAAAAA');
    const second = store.createRoom('s2', 'socket-2', 'Bob');
    expect(second.roomCode).toBe('BBBBBB');
  });

  it('отказывает после 10 коллизий', () => {
    const store = new RoomStore({ generateCode: () => 'AAAAAA' });
    store.createRoom('s1', 'socket-1', 'Alice');
    expect(store.createRoom('s2', 'socket-2', 'Bob')).toEqual({ error: 'code_conflict' });
  });

  it('успешно создаёт комнату, если уникальный код выпал на 10-й попытке (регресс off-by-one)', () => {
    let call = 0;
    const store = new RoomStore({ generateCode: () => (call++ < 9 ? 'AAAAAA' : 'BBBBBB') });
    store.createRoom('s1', 'socket-1', 'Alice');
    const result = store.createRoom('s2', 'socket-2', 'Bob');
    expect(result.roomCode).toBe('BBBBBB');
  });
});

describe('RoomStore.join', () => {
  it('добавляет участника и возвращает список', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    const result = store.join(roomCode.toLowerCase(), 's2', 'socket-2', 'Bob');
    expect(result.roomCode).toBe(roomCode);
    expect(result.participants.map(p => p.sessionId)).toEqual(['s1', 's2']);
  });

  it('отклоняет неверный формат кода', () => {
    const store = new RoomStore();
    expect(store.join('ABC12', 's2', 'socket-2', 'Bob')).toEqual({ error: 'bad_code' });
    expect(store.join(undefined, 's2', 'socket-2', 'Bob')).toEqual({ error: 'bad_code' });
  });

  it('отклоняет несуществующую комнату', () => {
    const store = new RoomStore();
    expect(store.join('ZZZZZZ', 's2', 'socket-2', 'Bob')).toEqual({ error: 'not_found', roomCode: 'ZZZZZZ' });
  });

  it(`отклоняет ${MAX_PARTICIPANTS + 1}-го участника`, () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'A');
    for (let i = 2; i <= MAX_PARTICIPANTS; i++) {
      expect(store.join(roomCode, `s${i}`, `socket-${i}`, `P${i}`).error).toBeUndefined();
    }
    expect(store.join(roomCode, 's6', 'socket-6', 'Six')).toEqual({ error: 'full', roomCode });
  });
});

describe('RoomStore.rejoin', () => {
  it('восстанавливает сессию по переданному имени (после disconnect прошлое имя удалено)', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.join(roomCode, 's2', 'socket-2', 'Bob');
    store.removeBySocket('socket-2');
    const result = store.rejoin(roomCode, 's2', 'socket-new', 'Bob');
    expect(result.name).toBe('Bob');
    expect(store.rooms.get(roomCode).get('s2').socketId).toBe('socket-new');
  });

  it('без имени берёт прошлое, если участник ещё числится в комнате', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    const result = store.rejoin(roomCode, 's1', 'socket-new', undefined);
    expect(result.name).toBe('Alice');
  });

  it('без имени и без прошлого — Аноним', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.removeBySocket('socket-1');
    const result = store.rejoin(roomCode, 's1', 'socket-new', undefined);
    expect(result.name).toBe('Аноним');
  });

  it('использует переданное имя при повторном входе', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    const result = store.rejoin(roomCode, 's1', 'socket-new', 'New Name');
    expect(result.name).toBe('New Name');
  });

  it('отклоняет неизвестную комнату', () => {
    const store = new RoomStore();
    expect(store.rejoin('ZZZZZZ', 's1', 'socket-1', 'A')).toEqual({ error: 'not_found', roomCode: 'ZZZZZZ' });
  });

  it('не пускает нового участника в полную комнату, но пускает вернувшегося', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'A');
    for (let i = 2; i <= MAX_PARTICIPANTS; i++) {
      store.join(roomCode, `s${i}`, `socket-${i}`, `P${i}`);
    }
    expect(store.rejoin(roomCode, 's-new', 'socket-x', 'X').error).toBe('full');
    store.removeBySocket('socket-3');
    expect(store.rejoin(roomCode, 's3', 'socket-new', 'P3').error).toBeUndefined();
  });
});

describe('RoomStore.leave / removeBySocket', () => {
  it('leave удаляет участника и возвращает его имя', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    expect(store.leave(roomCode, 's1')).toEqual({ roomCode, name: 'Alice' });
    expect(store.rooms.get(roomCode).size).toBe(0);
  });

  it('leave неизвестной сессии или комнаты — null', () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    expect(store.leave(roomCode, 'unknown')).toBe(null);
    expect(store.leave('ZZZZZZ', 's1')).toBe(null);
    expect(store.leave(undefined, 's1')).toBe(null);
  });

  it('removeBySocket удаляет участника из всех комнат', () => {
    const store = new RoomStore();
    const { roomCode: code1 } = store.createRoom('s1', 'socket-1', 'Alice');
    const { roomCode: code2 } = store.createRoom('s2', 'socket-1', 'Alice');
    const removed = store.removeBySocket('socket-1');
    expect(removed).toEqual([
      { roomCode: code1, sessionId: 's1', name: 'Alice' },
      { roomCode: code2, sessionId: 's2', name: 'Alice' }
    ]);
    expect(store.rooms.get(code1).size).toBe(0);
    expect(store.rooms.get(code2).size).toBe(0);
  });
});

describe('время жизни комнаты', () => {
  it('пустая комната удаляется по истечении ttl', async () => {
    const store = new RoomStore({ ttlMs: 20 });
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.leave(roomCode, 's1');
    expect(store.rooms.has(roomCode)).toBe(true);
    await sleep(60);
    expect(store.rooms.has(roomCode)).toBe(false);
    expect(store.timers.size).toBe(0);
  });

  it('комната с участником не удаляется таймером', async () => {
    const store = new RoomStore({ ttlMs: 20 });
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.join(roomCode, 's2', 'socket-2', 'Bob');
    store.leave(roomCode, 's2');
    await sleep(60);
    // s1 всё ещё в комнате — таймер не должен её удалить
    expect(store.rooms.has(roomCode)).toBe(true);
    store.leave(roomCode, 's1');
    await sleep(60);
    expect(store.rooms.has(roomCode)).toBe(false);
  });

  it('join и rejoin отменяют запланированную очистку', async () => {
    const store = new RoomStore({ ttlMs: 30 });
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.removeBySocket('socket-1'); // комната пуста, очистка запланирована
    store.rejoin(roomCode, 's1', 'socket-new', 'Alice');
    await sleep(50);
    expect(store.rooms.has(roomCode)).toBe(true);
    expect(store.timers.size).toBe(0);
  });
});

describe('RoomStore.relay', () => {
  const setup = () => {
    const store = new RoomStore();
    const { roomCode } = store.createRoom('s1', 'socket-1', 'Alice');
    store.join(roomCode, 's2', 'socket-2', 'Bob');
    return { store, roomCode };
  };

  it('резолвит адресата по sessionId и помечает отправителя', () => {
    const { store, roomCode } = setup();
    const result = store.relay('socket-2', roomCode, 's1', { offer: { sdp: 'x' } });
    expect(result.targetSocketId).toBe('socket-1');
    expect(result.payload).toEqual({
      offer: { sdp: 'x' },
      fromSessionId: 's2',
      name: 'Bob'
    });
  });

  it('отказывает для несуществующей комнаты, чужака и самого себя', () => {
    const { store, roomCode } = setup();
    expect(store.relay('socket-2', 'ZZZZZZ', 's1', {})).toBe(null);
    expect(store.relay('socket-outsider', roomCode, 's1', {})).toBe(null);
    expect(store.relay('socket-2', roomCode, 's2', {})).toBe(null);
    expect(store.relay('socket-2', roomCode, 'unknown', {})).toBe(null);
    expect(store.relay('socket-2', undefined, 's1', {})).toBe(null);
  });
});
