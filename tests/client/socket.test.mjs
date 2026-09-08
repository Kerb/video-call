// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocketClient } from '../../client/socket.js';

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.emitted = [];
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  emit(event, data) {
    this.emitted.push({ event, data });
  }

  trigger(event, data) {
    for (const handler of this.handlers.get(event) || []) handler(data);
  }

  lastEmit(event) {
    const found = this.emitted.filter((e) => e.event === event);
    return found.length ? found[found.length - 1].data : undefined;
  }
}

function makeApp() {
  return {
    sessionId: 'me',
    roomCode: 'ABC123',
    name: 'Alice',
    roomCodeExists: true,
    ui: { showError: vi.fn(), showLandingScreen: vi.fn() },
    chat: { onMessageReceived: vi.fn(), onTypingReceived: vi.fn() },
    onRoomCreated: vi.fn(),
    onRoomJoined: vi.fn(),
    onUserJoined: vi.fn(),
    onUserLeft: vi.fn(),
    handleOffer: vi.fn(),
    handleAnswer: vi.fn(),
    handleIceCandidate: vi.fn()
  };
}

describe('SocketClient', () => {
  let app;
  let fakeSocket;
  let client;
  let connectUrl;

  beforeEach(() => {
    vi.useRealTimers();
    window.SOCKET_URL = 'http://localhost:3001';
    app = makeApp();
    fakeSocket = new FakeSocket();
    const factory = (url) => {
      connectUrl = url;
      return fakeSocket;
    };
    client = new SocketClient(app, () => factory);
  });

  const connect = async () => {
    const pending = client.connect();
    fakeSocket.trigger('connect');
    await pending;
  };

  describe('connect', () => {
    it('резолвится на connect и запоминает URL сервера', async () => {
      await connect();
      expect(client.connected).toBe(true);
      expect(connectUrl).toBe('http://localhost:3001');
    });

    it('reject-ится на connect_error', async () => {
      const pending = client.connect();
      fakeSocket.trigger('connect_error', new Error('boom'));
      await expect(pending).rejects.toThrow('boom');
    });

    it('фолбэк на window.location.origin без SOCKET_URL', async () => {
      delete window.SOCKET_URL;
      const pending = client.connect();
      fakeSocket.trigger('connect');
      await pending;
      expect(connectUrl).toBe(window.location.origin);
    });
  });

  describe('адресация WebRTC-сигналов (регресс self-targeting)', () => {
    it('sendOffer адресует по targetSessionId и не подставляет свой socket id', async () => {
      await connect();
      client.sendOffer('peer-1', { type: 'offer', sdp: 'x' });
      const data = fakeSocket.lastEmit('offer');
      expect(data).toEqual({
        targetSessionId: 'peer-1',
        roomCode: 'ABC123',
        offer: { type: 'offer', sdp: 'x' }
      });
      expect(data.targetSocketId).toBeUndefined();
    });

    it('sendAnswer и sendIceCandidate используют тот же контракт', async () => {
      await connect();
      client.sendAnswer('peer-1', { type: 'answer' });
      client.sendIceCandidate('peer-1', { candidate: 'c' });
      expect(fakeSocket.lastEmit('answer')).toEqual({
        targetSessionId: 'peer-1',
        roomCode: 'ABC123',
        answer: { type: 'answer' }
      });
      expect(fakeSocket.lastEmit('ice-candidate')).toEqual({
        targetSessionId: 'peer-1',
        roomCode: 'ABC123',
        candidate: { candidate: 'c' }
      });
    });
  });

  describe('события от сервера', () => {
    it('offer передаёт fromSessionId и имя отправителя', async () => {
      await connect();
      fakeSocket.trigger('offer', { offer: { sdp: 'x' }, fromSessionId: 'peer-1', name: 'Bob' });
      expect(app.handleOffer).toHaveBeenCalledWith({ sdp: 'x' }, 'peer-1', 'Bob');
    });

    it('answer и ice-candidate передают fromSessionId', async () => {
      await connect();
      fakeSocket.trigger('answer', { answer: { sdp: 'a' }, fromSessionId: 'peer-1' });
      fakeSocket.trigger('ice-candidate', { candidate: { c: 1 }, fromSessionId: 'peer-1' });
      expect(app.handleAnswer).toHaveBeenCalledWith({ sdp: 'a' }, 'peer-1');
      expect(app.handleIceCandidate).toHaveBeenCalledWith({ c: 1 }, 'peer-1');
    });

    it('room-created/room-joined/room-rejoined ведут в приложение', async () => {
      await connect();
      fakeSocket.trigger('room-created', { roomCode: 'X1' });
      fakeSocket.trigger('room-joined', { roomCode: 'X2', participants: [] });
      fakeSocket.trigger('room-rejoined', { roomCode: 'X3', participants: [] });
      expect(app.onRoomCreated).toHaveBeenCalledWith('X1');
      expect(app.onRoomJoined).toHaveBeenCalledWith('X2', []);
      expect(app.onRoomJoined).toHaveBeenCalledWith('X3', []);
    });

    it('user-joined/user-left прокидываются', async () => {
      await connect();
      fakeSocket.trigger('user-joined', { sessionId: 'p', name: 'Bob' });
      fakeSocket.trigger('user-left', { sessionId: 'p' });
      expect(app.onUserJoined).toHaveBeenCalledWith('p', 'Bob');
      expect(app.onUserLeft).toHaveBeenCalledWith('p');
    });

    it('error и room-full показывают ошибку; room-full возвращает на landing', async () => {
      await connect();
      fakeSocket.trigger('error', { message: 'Ой' });
      expect(app.ui.showError).toHaveBeenCalledWith('Ой');
      expect(app.ui.showLandingScreen).not.toHaveBeenCalled();

      fakeSocket.trigger('room-full', { message: 'Полно' });
      expect(app.ui.showError).toHaveBeenCalledWith('Полно');
      expect(app.ui.showLandingScreen).toHaveBeenCalled();
    });

    it('чатовые события идут в chat', async () => {
      await connect();
      fakeSocket.trigger('chat-message', { text: 'hi' });
      fakeSocket.trigger('typing', { sessionId: 'p' });
      expect(app.chat.onMessageReceived).toHaveBeenCalledWith({ text: 'hi' });
      expect(app.chat.onTypingReceived).toHaveBeenCalledWith({ sessionId: 'p' });
    });
  });

  describe('переподключение', () => {
    it('disconnect планирует rejoin через секунду', async () => {
      vi.useFakeTimers();
      await connect();

      fakeSocket.trigger('disconnect', 'transport close');
      expect(fakeSocket.emitted.filter((e) => e.event === 'rejoin-room').length).toBe(0);

      vi.advanceTimersByTime(1000);
      expect(fakeSocket.lastEmit('rejoin-room')).toEqual({
        sessionId: 'me',
        roomCode: 'ABC123',
        name: 'Alice'
      });
    });

    it('server-side disconnect не вызывает rejoin', async () => {
      vi.useFakeTimers();
      await connect();
      fakeSocket.trigger('disconnect', 'io server disconnect');
      vi.advanceTimersByTime(2000);
      expect(fakeSocket.emitted.filter((e) => e.event === 'rejoin-room').length).toBe(0);
    });

    it('rejoinRoom отправляет sessionId, roomCode и имя', async () => {
      await connect();
      client.rejoinRoom();
      expect(fakeSocket.lastEmit('rejoin-room')).toEqual({
        sessionId: 'me',
        roomCode: 'ABC123',
        name: 'Alice'
      });
    });
  });

  describe('остальные эмиттеры', () => {
    it('createRoom/joinRoom/leaveRoom/sendChatMessage/sendTyping', async () => {
      await connect();
      client.createRoom('me', 'Alice');
      client.joinRoom('me', 'Alice', 'ABC123');
      client.leaveRoom('me', 'ABC123');
      client.sendChatMessage('hello');
      client.sendTyping();

      expect(fakeSocket.lastEmit('create-room')).toEqual({ sessionId: 'me', name: 'Alice' });
      expect(fakeSocket.lastEmit('join-room')).toEqual({ sessionId: 'me', name: 'Alice', roomCode: 'ABC123' });
      expect(fakeSocket.lastEmit('leave-room')).toEqual({ sessionId: 'me', roomCode: 'ABC123' });
      expect(fakeSocket.lastEmit('chat-message')).toEqual({
        roomCode: 'ABC123', sessionId: 'me', name: 'Alice', text: 'hello'
      });
      expect(fakeSocket.lastEmit('typing')).toEqual({
        roomCode: 'ABC123', sessionId: 'me', name: 'Alice'
      });
    });
  });
});
