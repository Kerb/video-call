import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSignalingServer } from '../../server/server.js';
import { io as connectClient } from 'socket.io-client';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function once(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function neverFires(socket, event, ms = 200) {
  return new Promise((resolve) => {
    const onEvent = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve(false);
    }, ms);
    socket.on(event, onEvent);
  });
}

describe('signaling server (integration)', () => {
  let httpServer;
  let port;
  let clients;

  beforeEach(async () => {
    const { server } = createSignalingServer();
    httpServer = server;
    port = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const client = () => {
    const socket = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    clients.push(socket);
    return socket;
  };

  const connected = async () => {
    const socket = client();
    await once(socket, 'connect');
    return socket;
  };

  const createRoom = async (socket, sessionId = 's1', name = 'Alice') => {
    socket.emit('create-room', { sessionId, name });
    return once(socket, 'room-created');
  };

  it('create-room возвращает код и создателя', async () => {
    const socket = await connected();
    const data = await createRoom(socket, 's1', 'Alice');
    expect(data.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(data.sessionId).toBe('s1');
    expect(data.participants).toEqual([{ sessionId: 's1', name: 'Alice' }]);
  });

  it('create-room без sessionId отвечает ошибкой, а не падает', async () => {
    const socket = await connected();
    socket.emit('create-room', {});
    const error = await once(socket, 'error');
    expect(error.message).toBeTruthy();
  });

  it('join-room: успех, нормализация регистра, user-joined остальным', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's1', 'Alice');

    bob.emit('join-room', { sessionId: 's2', name: 'Bob', roomCode: roomCode.toLowerCase() });
    const [joined, userJoined] = await Promise.all([
      once(bob, 'room-joined'),
      once(alice, 'user-joined')
    ]);

    expect(joined.roomCode).toBe(roomCode);
    expect(joined.participants).toEqual([
      { sessionId: 's1', name: 'Alice', isSelf: false },
      { sessionId: 's2', name: 'Bob', isSelf: true }
    ]);
    expect(userJoined).toEqual({ sessionId: 's2', name: 'Bob' });
  });

  it('join-room: неверный формат кода и несуществующая комната', async () => {
    const socket = await connected();
    socket.emit('join-room', { sessionId: 's2', name: 'Bob', roomCode: 'ABC12' });
    expect((await once(socket, 'error')).message).toContain('Неверный формат кода');

    socket.emit('join-room', { sessionId: 's2', name: 'Bob', roomCode: 'ZZZZZZ' });
    expect((await once(socket, 'error')).message).toContain('Комната не найдена');
  });

  it('join-room: 6-й участник получает room-full', async () => {
    const sockets = [];
    const creator = await connected();
    sockets.push(creator);
    const { roomCode } = await createRoom(creator, 's1', 'P1');
    for (let i = 2; i <= 5; i++) {
      const socket = await connected();
      sockets.push(socket);
      socket.emit('join-room', { sessionId: `s${i}`, name: `P${i}`, roomCode });
      await once(socket, 'room-joined');
    }
    const sixth = await connected();
    sockets.push(sixth);
    sixth.emit('join-room', { sessionId: 's6', name: 'P6', roomCode });
    expect((await once(sixth, 'room-full')).message).toContain('Максимум 5');
  });

  it('offer доставляется адресату по sessionId, а не обратно отправителю (регресс self-targeting)', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    const bobGotOwnOffer = neverFires(bob, 'offer', 250);
    bob.emit('offer', {
      targetSessionId: 's-alice',
      roomCode,
      offer: { type: 'offer', sdp: 'test-sdp' }
    });

    const offer = await once(alice, 'offer');
    expect(offer).toEqual({
      offer: { type: 'offer', sdp: 'test-sdp' },
      fromSessionId: 's-bob',
      name: 'Bob'
    });
    expect(await bobGotOwnOffer).toBe(false);
  });

  it('answer и ice-candidate релеятся адресату', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    bob.emit('answer', { targetSessionId: 's-alice', roomCode, answer: { type: 'answer' } });
    const answer = await once(alice, 'answer');
    expect(answer.fromSessionId).toBe('s-bob');
    expect(answer.answer).toEqual({ type: 'answer' });

    bob.emit('ice-candidate', { targetSessionId: 's-alice', roomCode, candidate: { candidate: 'c' } });
    const ice = await once(alice, 'ice-candidate');
    expect(ice.candidate).toEqual({ candidate: 'c' });
    expect(ice.fromSessionId).toBe('s-bob');
  });

  it('сигнал от постороннего клиента не релеится', async () => {
    const alice = await connected();
    const bob = await connected();
    const outsider = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    const aliceGotOffer = neverFires(alice, 'offer', 250);
    outsider.emit('offer', { targetSessionId: 's-alice', roomCode, offer: { type: 'offer' } });
    expect(await aliceGotOffer).toBe(false);
  });

  it('chat-message доставляется комнате с серверным именем и не валит сервер без payload', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    // Некорректный payload раньше ронял процесс (TypeError на undefined.toUpperCase)
    alice.emit('chat-message', {});
    alice.emit('typing', {});
    alice.emit('leave-room', {});
    alice.emit('rejoin-room', {});
    await sleep(100);

    bob.emit('chat-message', { roomCode, sessionId: 's-bob', name: '<fake>', text: 'hello' });
    const message = await once(alice, 'chat-message');
    expect(message.text).toBe('hello');
    expect(message.name).toBe('Bob'); // имя берётся с сервера, а не из payload
    expect(message.sessionId).toBe('s-bob');
    expect(message.timestamp).toBeGreaterThan(0);

    // Сервер жив после некорректных payload
    const carol = await connected();
    const created = await createRoom(carol, 's-carol', 'Carol');
    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('chat-message длиннее 1000 символов обрезается', async () => {
    const alice = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    alice.emit('chat-message', { roomCode, sessionId: 's-alice', name: 'Alice', text: 'x'.repeat(1500) });
    const message = await once(alice, 'chat-message');
    expect(message.text.length).toBe(1000);
  });

  it('typing получают только остальные участники', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    const bobGotTyping = neverFires(bob, 'typing', 250);
    bob.emit('typing', { roomCode, sessionId: 's-bob', name: 'Bob' });
    const typing = await once(alice, 'typing');
    expect(typing).toEqual({ sessionId: 's-bob', name: 'Bob' });
    expect(await bobGotTyping).toBe(false);
  });

  it('leave-room: user-left остальным, вышедший исключён из рассылки', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    const bobGotLeft = neverFires(bob, 'user-left', 250);
    bob.emit('leave-room', { sessionId: 's-bob', roomCode });
    const left = await once(alice, 'user-left');
    expect(left).toEqual({ sessionId: 's-bob', name: 'Bob' });
    expect(await bobGotLeft).toBe(false);

    // После выхода Боб больше не получает сообщения комнаты
    const bobGotChat = neverFires(bob, 'chat-message', 250);
    alice.emit('chat-message', { roomCode, sessionId: 's-alice', name: 'Alice', text: 'bye' });
    await once(alice, 'chat-message');
    expect(await bobGotChat).toBe(false);
  });

  it('disconnect: участник удаляется, остальные получают user-left', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    bob.close();
    const left = await once(alice, 'user-left');
    expect(left).toEqual({ sessionId: 's-bob', name: 'Bob' });
  });

  it('rejoin-room: восстановление сессии и user-joined остальным (регресс rejoin)', async () => {
    const alice = await connected();
    const bob = await connected();
    const { roomCode } = await createRoom(alice, 's-alice', 'Alice');
    bob.emit('join-room', { sessionId: 's-bob', name: 'Bob', roomCode });
    await Promise.all([once(bob, 'room-joined'), once(alice, 'user-joined')]);

    bob.close();
    await once(alice, 'user-left');

    const bobAgain = await connected();
    bobAgain.emit('rejoin-room', { sessionId: 's-bob', roomCode, name: 'Bob' });
    const [rejoined, userJoined] = await Promise.all([
      once(bobAgain, 'room-rejoined'),
      once(alice, 'user-joined')
    ]);
    expect(rejoined.roomCode).toBe(roomCode);
    expect(rejoined.participants.map(p => p.sessionId)).toEqual(['s-alice', 's-bob']);
    expect(userJoined).toEqual({ sessionId: 's-bob', name: 'Bob' });
  });

  it('rejoin-room в несуществующую комнату отвечает ошибкой', async () => {
    const socket = await connected();
    socket.emit('rejoin-room', { sessionId: 's1', roomCode: 'ZZZZZZ' });
    expect((await once(socket, 'error')).message).toContain('Комната не найдена');
  });

  it('rejoin-room без roomCode не валит сервер', async () => {
    const socket = await connected();
    socket.emit('rejoin-room', { sessionId: 's1' });
    const error = await once(socket, 'error');
    expect(error.message).toBeTruthy();
  });
});
