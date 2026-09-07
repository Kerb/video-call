// Main entry point
import { WebRTCClient } from './webrtc.js';
import { SocketClient } from './socket.js';
import { UI } from './ui.js';
import { Chat } from './chat.js';
import { NameGenerator } from './name-generator.js';

class VideoCallApp {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.roomCode = null;
    this.name = null;
    this.socket = null;
    this.webrtc = null;
    this.ui = null;
    this.chat = null;
    this.localStream = null;
    this.participants = new Map();
  }

  generateSessionId() {
    // Восстанавливаем из sessionStorage или генерируем новый
    let id = sessionStorage.getItem('sessionId');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('sessionId', id);
    }
    return id;
  }

  async init() {
    console.log('[App] Initializing...');
    
    // Инициализация UI
    this.ui = new UI(this);
    
    // Подключение к серверу
    this.socket = new SocketClient(this);
    await this.socket.connect();
    
    // Инициализация WebRTC
    this.webrtc = new WebRTCClient(this);
    
    // Инициализация чата
    this.chat = new Chat(this);
    
    // Настройка обработчиков событий
    this.setupEventListeners();
    
    console.log('[App] Initialized');
  }

  setupEventListeners() {
    // Кнопка создания комнаты
    document.getElementById('create-room-btn')?.addEventListener('click', () => {
      this.showNameInputOrCreate();
    });

    // Кнопка входа в комнату
    document.getElementById('join-room-btn')?.addEventListener('click', () => {
      this.joinRoom();
    });

    // Enter в поле кода комнаты
    document.getElementById('room-code-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinRoom();
      }
    });
  }

  showNameInputOrCreate() {
    const name = this.ui.promptForName();
    this.name = name || NameGenerator.generate();
    this.createRoom();
  }

  async createRoom() {
    try {
      this.ui.showConnecting();
      this.socket.createRoom(this.sessionId, this.name);
    } catch (error) {
      console.error('[App] Create room error:', error);
      this.ui.showError('Не удалось создать комнату. Попробуйте позже.');
    }
  }

  joinRoom() {
    const codeInput = document.getElementById('room-code-input');
    const roomCode = codeInput?.value.trim().toUpperCase();
    
    if (!roomCode) {
      this.ui.showError('Введите код комнаты');
      return;
    }

    const nameInput = document.getElementById('join-name-input');
    this.name = nameInput?.value.trim() || NameGenerator.generate();

    try {
      this.ui.showConnecting();
      this.socket.joinRoom(this.sessionId, this.name, roomCode);
    } catch (error) {
      console.error('[App] Join room error:', error);
      this.ui.showError('Не удалось войти в комнату');
    }
  }

  async onRoomCreated(roomCode) {
    console.log('[App] Room created:', roomCode);
    this.roomCode = roomCode;
    
    // Получаем медиа-потоки
    try {
      this.localStream = await this.webrtc.getLocalStream();
      await this.ui.showRoomScreen(roomCode, this.name, true);
      this.chat.init();
    } catch (error) {
      console.error('[App] Get media error:', error);
      this.ui.showError('Не удалось получить доступ к камере/микрофону');
    }
  }

  async onRoomJoined(roomCode, participants) {
    console.log('[App] Room joined:', roomCode, participants);
    this.roomCode = roomCode;
    
    // Получаем медиа-потоки
    try {
      this.localStream = await this.webrtc.getLocalStream();
      await this.ui.showRoomScreen(roomCode, this.name, false);
      this.chat.init();
      
      // Инициализируем соединения с существующими участниками
      for (const participant of participants) {
        if (participant.sessionId !== this.sessionId) {
          this.participants.set(participant.sessionId, participant);
          await this.webrtc.createPeerConnection(participant.sessionId, participant.name, true);
        }
      }
    } catch (error) {
      console.error('[App] Get media error:', error);
      this.ui.showError('Не удалось получить доступ к камере/микрофону');
    }
  }

  async onUserJoined(sessionId, name) {
    console.log('[App] User joined:', sessionId, name);
    this.participants.set(sessionId, { sessionId, name });
    
    // Создаём PeerConnection как инициатор (мы уже в комнате)
    if (this.roomCode) {
      await this.webrtc.createPeerConnection(sessionId, name, true);
    }
  }

  onUserLeft(sessionId) {
    console.log('[App] User left:', sessionId);
    this.participants.delete(sessionId);
    this.webrtc.closePeerConnection(sessionId);
    this.ui.removeVideo(sessionId);
  }

  async handleOffer(offer, sessionId, name) {
    console.log('[App] Handling offer from:', sessionId);
    
    if (!this.participants.has(sessionId)) {
      this.participants.set(sessionId, { sessionId, name });
    }
    
    await this.webrtc.handleOffer(sessionId, offer);
  }

  async handleAnswer(answer, sessionId) {
    console.log('[App] Handling answer from:', sessionId);
    await this.webrtc.handleAnswer(sessionId, answer);
  }

  async handleIceCandidate(candidate, sessionId) {
    await this.webrtc.addIceCandidate(sessionId, candidate);
  }

  async leaveRoom() {
    console.log('[App] Leaving room');
    
    if (this.socket && this.roomCode) {
      this.socket.leaveRoom(this.sessionId, this.roomCode);
    }
    
    this.webrtc.closeAllConnections();
    this.webrtc.stopLocalStream();
    
    this.roomCode = null;
    this.participants.clear();
    
    this.ui.showLandingScreen();
  }
}

// Запуск приложения
const app = new VideoCallApp();
app.init().catch(console.error);
