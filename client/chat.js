/**
 * Chat Module
 * Handles chat functionality
 */
export class Chat {
  constructor(app) {
    this.app = app;
    this.typingTimeout = null;
  }

  /**
   * Инициализация чата
   */
  init() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat-btn');

    // Отправка по клику
    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Отправка по Enter
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    // Индикатор набора
    chatInput?.addEventListener('input', () => {
      this.handleTyping();
    });
  }

  /**
   * Отправка сообщения
   */
  sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput?.value.trim();

    if (!text) {
      return;
    }

    // Ограничение длины
    if (text.length > 1000) {
      this.app.ui.showError('Сообщение слишком длинное (максимум 1000 символов)');
      return;
    }

    // Отправляем через сокет
    this.app.socket.sendChatMessage(text);

    // Очищаем поле
    if (chatInput) {
      chatInput.value = '';
    }

    // Скрываем индикатор набора
    this.hideTyping();
  }

  /**
   * Обработка входящего сообщения
   */
  onMessageReceived(data) {
    const { sessionId, name, text, timestamp } = data;
    this.app.ui.addChatMessage(sessionId, name, text, timestamp);
  }

  /**
   * Обработка индикатора набора
   */
  onTypingReceived(data) {
    const { sessionId, name } = data;
    
    // Не показываем для себя
    if (sessionId === this.app.sessionId) {
      return;
    }
    
    this.app.ui.showTyping(name);
  }

  /**
   * Обработка ввода текста
   */
  handleTyping() {
    // Отправляем событие только один раз
    if (!this.typingTimeout) {
      this.app.socket.sendTyping();
    }

    // Сбрасываем таймер
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.typingTimeout = null;
    }, 1000);
  }

  /**
   * Скрытие индикатора набора
   */
  hideTyping() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }
}
