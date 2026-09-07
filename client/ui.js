/**
 * UI Module
 * Handles DOM manipulation and user interface
 */
export class UI {
  constructor(app) {
    this.app = app;
    this.elements = {};
    this.isChatOpen = false;
    
    // Кэшируем элементы сразу после создания
    this.cacheElements();
  }

  /**
   * Кэширование DOM элементов
   */
  cacheElements() {
    console.log('[UI] Caching elements...');
    
    // Landing screen
    this.elements.landingScreen = document.getElementById('landing-screen');
    this.elements.createRoomBtn = document.getElementById('create-room-btn');
    this.elements.joinRoomBtn = document.getElementById('join-room-btn');
    this.elements.roomCodeInput = document.getElementById('room-code-input');
    this.elements.joinNameInput = document.getElementById('join-name-input');

    // Room screen
    this.elements.roomScreen = document.getElementById('room-screen');
    this.elements.connectingIndicator = document.getElementById('connecting-indicator');
    this.elements.videoGrid = document.getElementById('video-grid');
    this.elements.roomCodeText = document.getElementById('room-code-text');
    this.elements.copyCodeBtn = document.getElementById('copy-code-btn');

    // Controls
    this.elements.toggleAudioBtn = document.getElementById('toggle-audio-btn');
    this.elements.toggleVideoBtn = document.getElementById('toggle-video-btn');
    this.elements.screenShareBtn = document.getElementById('screen-share-btn');
    this.elements.toggleChatBtn = document.getElementById('toggle-chat-btn');
    this.elements.leaveRoomBtn = document.getElementById('leave-room-btn');
    this.elements.settingsBtn = document.getElementById('settings-btn');

    // Chat
    this.elements.chatPanel = document.getElementById('chat-panel');
    this.elements.chatMessages = document.getElementById('chat-messages');
    this.elements.chatInput = document.getElementById('chat-input');
    this.elements.sendChatBtn = document.getElementById('send-chat-btn');
    this.elements.toggleChatBtn = document.getElementById('toggle-chat-btn');
    this.elements.closeChatBtn = document.getElementById('close-chat-btn');
    this.elements.typingIndicator = document.getElementById('typing-indicator');

    // Settings modal
    this.elements.settingsModal = document.getElementById('settings-modal');
    this.elements.closeSettingsBtn = document.getElementById('close-settings-btn');
    this.elements.cameraSelect = document.getElementById('camera-select');
    this.elements.microphoneSelect = document.getElementById('microphone-select');

    // Error modal
    this.elements.errorModal = document.getElementById('error-modal');
    this.elements.errorMessage = document.getElementById('error-message');
    this.elements.closeErrorBtn = document.getElementById('close-error-btn');
    this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    
    console.log('[UI] Elements cached:', {
      landingScreen: !!this.elements.landingScreen,
      createRoomBtn: !!this.elements.createRoomBtn,
      roomScreen: !!this.elements.roomScreen,
      videoGrid: !!this.elements.videoGrid
    });
  }

  /**
   * Показ главного экрана
   */
  showLandingScreen() {
    this.elements.landingScreen?.classList.add('active');
    this.elements.roomScreen?.classList.remove('active');
    this.elements.roomCodeInput.value = '';
    this.elements.joinNameInput.value = '';
  }

  /**
   * Показ индикатора подключения
   */
  showConnecting() {
    this.elements.connectingIndicator?.classList.add('active');
  }

  /**
   * Скрытие индикатора подключения
   */
  hideConnecting() {
    this.elements.connectingIndicator?.classList.remove('active');
  }

  /**
   * Показ экрана комнаты
   */
  async showRoomScreen(roomCode, name, isCreator) {
    console.log('[UI] Showing room screen...', { roomCode, name, isCreator });
    console.log('[UI] Elements:', {
      landingScreen: !!this.elements.landingScreen,
      roomScreen: !!this.elements.roomScreen,
      videoGrid: !!this.elements.videoGrid
    });
    
    this.hideConnecting();
    this.elements.landingScreen?.classList.remove('active');
    this.elements.roomScreen?.classList.add('active');
    console.log('[UI] Screen classes updated');

    // Обновляем код комнаты
    if (this.elements.roomCodeText) {
      this.elements.roomCodeText.textContent = roomCode;
      console.log('[UI] Room code set:', roomCode);
    }

    // Добавляем локальное видео
    if (this.app.localStream) {
      console.log('[UI] Adding local video');
      this.addLocalVideo(name);
    } else {
      console.warn('[UI] No local stream!');
    }

    // Setup controls
    this.setupRoomControls();
    console.log('[UI] Room controls setup');

    console.log('[UI] Room screen shown:', roomCode);
  }

  /**
   * Добавление локального видео
   */
  addLocalVideo(name) {
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = 'video-local';
    
    const video = document.createElement('video');
    video.srcObject = this.app.localStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Mute local video to prevent feedback
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'participant-name';
    nameDiv.innerHTML = `
      <span class="avatar">${name.charAt(0).toUpperCase()}</span>
      <span>${name} (вы)</span>
    `;
    
    container.appendChild(video);
    container.appendChild(nameDiv);
    this.elements.videoGrid?.appendChild(container);
    
    video.play().catch(console.error);
  }

  /**
   * Добавление удалённого видео
   */
  addRemoteVideo(sessionId, name, stream) {
    // Проверяем, существует ли уже видео
    let container = document.getElementById(`video-${sessionId}`);
    if (container) {
      return;
    }
    
    container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-${sessionId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'participant-name';
    nameDiv.innerHTML = `
      <span class="avatar">${name.charAt(0).toUpperCase()}</span>
      <span>${name}</span>
    `;
    
    container.appendChild(video);
    container.appendChild(nameDiv);
    this.elements.videoGrid?.appendChild(container);
    
    video.play().catch(console.error);
    
    console.log('[UI] Remote video added:', sessionId);
  }

  /**
   * Удаление видео участника
   */
  removeVideo(sessionId) {
    const container = document.getElementById(`video-${sessionId}`);
    if (container) {
      container.remove();
      console.log('[UI] Video removed:', sessionId);
    }
  }

  /**
   * Настройка кнопок управления
   */
  setupRoomControls() {
    // Микрофон
    this.elements.toggleAudioBtn?.addEventListener('click', () => {
      const isEnabled = this.elements.toggleAudioBtn.classList.contains('active');
      this.elements.toggleAudioBtn.classList.toggle('active');
      this.elements.toggleAudioBtn.querySelector('.icon').textContent = isEnabled ? '🔇' : '🎤';
      this.app.webrtc.toggleAudio(!isEnabled);
    });

    // Камера
    this.elements.toggleVideoBtn?.addEventListener('click', () => {
      const isEnabled = this.elements.toggleVideoBtn.classList.contains('active');
      this.elements.toggleVideoBtn.classList.toggle('active');
      this.elements.toggleVideoBtn.querySelector('.icon').textContent = isEnabled ? '📷' : '📹';
      this.app.webrtc.toggleVideo(!isEnabled);
    });

    // Демонстрация экрана
    this.elements.screenShareBtn?.addEventListener('click', async () => {
      const isSharing = this.elements.screenShareBtn.classList.contains('active');
      if (isSharing) {
        await this.app.webrtc.toggleScreenShareOff();
        this.elements.screenShareBtn.classList.remove('active');
      } else {
        const success = await this.app.webrtc.toggleScreenShare();
        if (success) {
          this.elements.screenShareBtn.classList.add('active');
        }
      }
    });

    // Чат
    this.elements.toggleChatBtn?.addEventListener('click', () => {
      this.toggleChat();
    });

    this.elements.closeChatBtn?.addEventListener('click', () => {
      this.toggleChat();
    });

    // Копирование кода
    this.elements.copyCodeBtn?.addEventListener('click', () => {
      const code = this.elements.roomCodeText?.textContent;
      if (code) {
        navigator.clipboard.writeText(code);
        this.showToast('Код комнаты скопирован', 'success');
      }
    });

    // Выход
    this.elements.leaveRoomBtn?.addEventListener('click', () => {
      if (confirm('Вы уверены, что хотите выйти из комнаты?')) {
        this.app.leaveRoom();
      }
    });

    // Настройки
    this.elements.settingsBtn?.addEventListener('click', () => {
      this.showSettings();
    });

    this.elements.closeSettingsBtn?.addEventListener('click', () => {
      this.hideSettings();
    });

    // Обработчики модальных окон
    this.elements.closeErrorBtn?.addEventListener('click', () => {
      this.hideError();
    });

    this.elements.errorOkBtn?.addEventListener('click', () => {
      this.hideError();
    });
  }

  /**
   * Переключение чата
   */
  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.elements.chatPanel?.classList.remove('hidden');
    } else {
      this.elements.chatPanel?.classList.add('hidden');
    }
  }

  /**
   * Добавление сообщения в чат
   */
  addChatMessage(sessionId, name, text, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const isSelf = sessionId === this.app.sessionId;
    
    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="sender-name">${isSelf ? 'Вы' : name}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text">${this.escapeHtml(text)}</div>
    `;
    
    this.elements.chatMessages?.appendChild(messageDiv);
    this.scrollToBottom();
  }

  /**
   * Показ индикатора "печатает"
   */
  showTyping(name) {
    if (this.elements.typingIndicator) {
      this.elements.typingIndicator.textContent = `${name} печатает...`;
      this.elements.typingIndicator.classList.remove('hidden');
      
      // Скрываем через 2 секунды
      setTimeout(() => {
        this.elements.typingIndicator?.classList.add('hidden');
      }, 2000);
    }
  }

  /**
   * Прокрутка чата вниз
   */
  scrollToBottom() {
    if (this.elements.chatMessages) {
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
  }

  /**
   * Запрос имени у пользователя
   */
  promptForName() {
    // В реальной реализации здесь должно быть модальное окно
    // Для простоты возвращаем null (имя сгенерируется)
    return null;
  }

  /**
   * Показ ошибки
   */
  showError(message) {
    if (this.elements.errorMessage) {
      this.elements.errorMessage.textContent = message;
    }
    this.elements.errorModal?.classList.remove('hidden');
  }

  /**
   * Скрытие ошибки
   */
  hideError() {
    this.elements.errorModal?.classList.add('hidden');
  }

  /**
   * Показ настроек
   */
  async showSettings() {
    const devices = await this.app.webrtc.getDevices();
    
    // Заполняем селекторы
    this.elements.cameraSelect.innerHTML = devices.videoDevices.map(d => 
      `<option value="${d.deviceId}">${d.label || `Камера ${d.deviceId.slice(0, 5)}...`}</option>`
    ).join('');
    
    this.elements.microphoneSelect.innerHTML = devices.audioDevices.map(d => 
      `<option value="${d.deviceId}">${d.label || `Микрофон ${d.deviceId.slice(0, 5)}...`}</option>`
    ).join('');
    
    this.elements.settingsModal?.classList.remove('hidden');
  }

  /**
   * Скрытие настроек
   */
  hideSettings() {
    this.elements.settingsModal?.classList.add('hidden');
  }

  /**
   * Показ toast уведомления
   */
  showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || this.createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  /**
   * Создание контейнера для toast
   */
  createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * Экранирование HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Обновление индикатора говорящего
   */
  updateSpeakingIndicator(sessionId, isSpeaking) {
    const container = document.getElementById(`video-${sessionId}`);
    if (container) {
      if (isSpeaking) {
        container.classList.add('speaking');
      } else {
        container.classList.remove('speaking');
      }
    }
  }
}
