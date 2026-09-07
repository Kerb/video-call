/**
 * Socket.io Client Module
 * Handles signaling communication with the server
 */
export class SocketClient {
  constructor(app) {
    this.app = app;
    this.socket = null;
    this.connected = false;
  }

  /**
   * Подключение к серверу
   */
  async connect() {
    // Для Vercel: используем переменную окружения или URL сервера из конфига
    const serverUrl = window.SOCKET_URL || process.env.SOCKET_URL || window.location.origin;
    
    return new Promise((resolve, reject) => {
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected to server');
        this.connected = true;
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.connected = false;
        
        // При переподключении пытаемся вернуться в комнату
        if (this.app.roomCode && reason !== 'io server disconnect') {
          setTimeout(() => {
            this.rejoinRoom();
          }, 1000);
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        reject(error);
      });

      // Обработчики событий от сервера
      this.setupEventHandlers();
    });
  }

  setupEventHandlers() {
    // Создание комнаты
    this.socket.on('room-created', (data) => {
      console.log('[Socket] Room created:', data);
      this.app.onRoomCreated(data.roomCode);
    });

    // Вход в комнату
    this.socket.on('room-joined', (data) => {
      console.log('[Socket] Room joined:', data);
      this.app.onRoomJoined(data.roomCode, data.participants);
    });

    // Повторный вход в комнату
    this.socket.on('room-rejoined', (data) => {
      console.log('[Socket] Room rejoined:', data);
      this.app.onRoomJoined(data.roomCode, data.participants);
    });

    // Ошибка
    this.socket.on('error', (data) => {
      console.error('[Socket] Error:', data.message);
      this.app.ui.showError(data.message);
    });

    // Комната переполнена
    this.socket.on('room-full', (data) => {
      console.warn('[Socket] Room full:', data.message);
      this.app.ui.showError(data.message);
      this.app.ui.showLandingScreen();
    });

    // Пользователь присоединился
    this.socket.on('user-joined', (data) => {
      console.log('[Socket] User joined:', data);
      this.app.onUserJoined(data.sessionId, data.name);
    });

    // Пользователь покинул
    this.socket.on('user-left', (data) => {
      console.log('[Socket] User left:', data);
      this.app.onUserLeft(data.sessionId);
    });

    // WebRTC Offer
    this.socket.on('offer', async (data) => {
      console.log('[Socket] Offer received from:', data.fromSocketId);
      await this.app.handleOffer(data.offer, data.sessionId, data.name || 'Unknown');
    });

    // WebRTC Answer
    this.socket.on('answer', async (data) => {
      console.log('[Socket] Answer received from:', data.fromSocketId);
      await this.app.handleAnswer(data.answer, data.sessionId);
    });

    // ICE Candidate
    this.socket.on('ice-candidate', async (data) => {
      await this.app.handleIceCandidate(data.candidate, data.sessionId);
    });

    // Chat message
    this.socket.on('chat-message', (data) => {
      this.app.chat.onMessageReceived(data);
    });

    // Typing indicator
    this.socket.on('typing', (data) => {
      this.app.chat.onTypingReceived(data);
    });
  }

  /**
   * Создание комнаты
   */
  createRoom(sessionId, name) {
    this.socket.emit('create-room', { sessionId, name });
  }

  /**
   * Вход в комнату
   */
  joinRoom(sessionId, name, roomCode) {
    this.socket.emit('join-room', { sessionId, name, roomCode });
  }

  /**
   * Повторный вход в комнату после переподключения
   */
  rejoinRoom() {
    if (this.app.roomCode && this.app.sessionId) {
      console.log('[Socket] Attempting to rejoin room:', this.app.roomCode);
      this.socket.emit('rejoin-room', {
        sessionId: this.app.sessionId,
        roomCode: this.app.roomCode
      });
    }
  }

  /**
   * Отправка WebRTC offer
   */
  sendOffer(targetSessionId, offer) {
    this.socket.emit('offer', {
      targetSocketId: this.app.socket.socket.id,
      sessionId: targetSessionId,
      roomCode: this.app.roomCode,
      offer
    });
  }

  /**
   * Отправка WebRTC answer
   */
  sendAnswer(targetSessionId, answer) {
    this.socket.emit('answer', {
      targetSocketId: this.app.socket.socket.id,
      sessionId: targetSessionId,
      roomCode: this.app.roomCode,
      answer
    });
  }

  /**
   * Отправка ICE кандидата
   */
  sendIceCandidate(targetSessionId, candidate) {
    this.socket.emit('ice-candidate', {
      targetSocketId: this.app.socket.socket.id,
      sessionId: targetSessionId,
      roomCode: this.app.roomCode,
      candidate
    });
  }

  /**
   * Отправка сообщения чата
   */
  sendChatMessage(text) {
    this.socket.emit('chat-message', {
      roomCode: this.app.roomCode,
      sessionId: this.app.sessionId,
      name: this.app.name,
      text
    });
  }

  /**
   * Отправка индикатора набора текста
   */
  sendTyping() {
    this.socket.emit('typing', {
      roomCode: this.app.roomCode,
      sessionId: this.app.sessionId,
      name: this.app.name
    });
  }

  /**
   * Выход из комнаты
   */
  leaveRoom(sessionId, roomCode) {
    this.socket.emit('leave-room', { sessionId, roomCode });
  }
}
