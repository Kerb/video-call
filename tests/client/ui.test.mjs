// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UI } from '../../client/ui.js';

// jsdom не реализует воспроизведение медиа
window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = vi.fn(() => Promise.resolve());

const DOM = `
  <div id="landing-screen"></div>
  <button id="create-room-btn"></button>
  <button id="join-room-btn"></button>
  <input id="room-code-input" />
  <input id="join-name-input" />
  <div id="room-screen"></div>
  <div id="connecting-indicator"></div>
  <div id="video-grid"></div>
  <span id="room-code-text"></span>
  <button id="copy-code-btn"></button>
  <button id="toggle-audio-btn" class="active"><span class="icon">🎤</span></button>
  <button id="toggle-video-btn" class="active"><span class="icon">📹</span></button>
  <button id="screen-share-btn"><span class="icon">🖥️</span></button>
  <button id="toggle-chat-btn"><span class="icon">💬</span></button>
  <button id="leave-room-btn"><span class="icon">📴</span></button>
  <button id="settings-btn"><span class="icon">⚙️</span></button>
  <div id="chat-panel" class="hidden"></div>
  <div id="chat-messages"></div>
  <input id="chat-input" />
  <button id="send-chat-btn"></button>
  <button id="close-chat-btn"></button>
  <div id="typing-indicator" class="hidden"></div>
  <div id="settings-modal" class="hidden">
    <select id="camera-select"></select>
    <select id="microphone-select"></select>
    <button id="close-settings-btn"></button>
  </div>
  <div id="error-modal" class="hidden">
    <p id="error-message"></p>
    <button id="close-error-btn"></button>
    <button id="error-ok-btn"></button>
  </div>
`;

const fakeStream = () => ({
  getTracks: () => [{ kind: 'video' }, { kind: 'audio' }]
});

function makeApp() {
  return {
    sessionId: 'me',
    localStream: fakeStream(),
    webrtc: {
      toggleAudio: vi.fn(),
      toggleVideo: vi.fn()
    },
    leaveRoom: vi.fn()
  };
}

describe('UI', () => {
  let app;
  let ui;

  beforeEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = DOM;
    app = makeApp();
    ui = new UI(app);
  });

  describe('escapeHtml', () => {
    it('экранирует HTML-спецсимволы', () => {
      expect(ui.escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(ui.escapeHtml('a & b')).toBe('a &amp; b');
    });
  });

  describe('addChatMessage', () => {
    it('экранирует текст сообщения (XSS-регресс)', () => {
      ui.addChatMessage('other', 'Bob', '<img src=x onerror=window.__pwned=1>', Date.now());
      const message = document.querySelector('.chat-message');
      expect(message.querySelectorAll('img').length).toBe(0);
      expect(message.querySelector('.message-text').textContent)
        .toBe('<img src=x onerror=window.__pwned=1>');
    });

    it('экранирует имя отправителя (XSS-регресс)', () => {
      ui.addChatMessage('other', '<img src=x onerror=1>', 'text', Date.now());
      const message = document.querySelector('.chat-message');
      expect(message.querySelectorAll('img').length).toBe(0);
      expect(message.querySelector('.sender-name').textContent).toContain('<img');
    });

    it('показывает "Вы" для своего sessionId', () => {
      ui.addChatMessage('me', 'Alice', 'text', Date.now());
      expect(document.querySelector('.sender-name').textContent).toBe('Вы');
    });

    it('форматирует время сообщения', () => {
      const fixed = new Date('2026-01-02T10:30:00');
      ui.addChatMessage('me', 'Alice', 'text', fixed.getTime());
      // формат зависит от локали окружения (например "10:30" или "10:30 AM")
      expect(document.querySelector('.message-time').textContent).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('addRemoteVideo', () => {
    it('добавляет видео с именем через textContent (XSS-регресс)', () => {
      ui.addRemoteVideo('s2', '<img src=x onerror=1>', fakeStream());
      const container = document.getElementById('video-s2');
      expect(container).toBeTruthy();
      expect(container.querySelectorAll('img').length).toBe(0);
      expect(container.querySelector('.participant-name').textContent)
        .toContain('<img src=x onerror=1>');
    });

    it('идемпотентен для одного sessionId', () => {
      ui.addRemoteVideo('s2', 'Bob', fakeStream());
      ui.addRemoteVideo('s2', 'Bob', fakeStream());
      expect(document.querySelectorAll('.video-container').length).toBe(1);
    });
  });

  describe('removeVideo', () => {
    it('удаляет контейнер участника', () => {
      ui.addRemoteVideo('s2', 'Bob', fakeStream());
      expect(document.getElementById('video-s2')).toBeTruthy();
      ui.removeVideo('s2');
      expect(document.getElementById('video-s2')).toBe(null);
    });
  });

  describe('ошибки', () => {
    it('showError/hideError управляют модалкой', () => {
      ui.showError('Что-то сломалось');
      expect(document.getElementById('error-modal').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('error-message').textContent).toBe('Что-то сломалось');
      ui.hideError();
      expect(document.getElementById('error-modal').classList.contains('hidden')).toBe(true);
    });
  });

  describe('showRoomScreen / setupRoomControls', () => {
    it('повторный вход в комнату не дублирует обработчики (регресс)', async () => {
      await ui.showRoomScreen('ABC123', 'Alice', true);
      await ui.showRoomScreen('ABC123', 'Alice', true);

      document.getElementById('toggle-audio-btn').click();
      expect(app.webrtc.toggleAudio).toHaveBeenCalledTimes(1);

      document.getElementById('toggle-video-btn').click();
      expect(app.webrtc.toggleVideo).toHaveBeenCalledTimes(1);
    });

    it('переключает состояние кнопки микрофона', async () => {
      await ui.showRoomScreen('ABC123', 'Alice', true);
      const button = document.getElementById('toggle-audio-btn');

      button.click(); // было активно -> выключаем
      expect(app.webrtc.toggleAudio).toHaveBeenCalledWith(false);
      expect(button.querySelector('.icon').textContent).toBe('🔇');

      button.click(); // было выключено -> включаем
      expect(app.webrtc.toggleAudio).toHaveBeenCalledWith(true);
      expect(button.querySelector('.icon').textContent).toBe('🎤');
    });

    it('показывает код комнаты и локальное видео', async () => {
      await ui.showRoomScreen('ABC123', 'Alice', true);
      expect(document.getElementById('room-code-text').textContent).toBe('ABC123');
      expect(document.getElementById('video-local')).toBeTruthy();
      expect(document.getElementById('landing-screen').classList.contains('active')).toBe(false);
      expect(document.getElementById('room-screen').classList.contains('active')).toBe(true);
    });
  });

  describe('showTyping', () => {
    it('показывает и скрывает индикатор', () => {
      vi.useFakeTimers();
      ui.showTyping('Bob');
      const indicator = document.getElementById('typing-indicator');
      expect(indicator.classList.contains('hidden')).toBe(false);
      expect(indicator.textContent).toBe('Bob печатает...');
      vi.advanceTimersByTime(2100);
      expect(indicator.classList.contains('hidden')).toBe(true);
    });
  });

  describe('showToast', () => {
    it('создает toast и удаляет через 3 секунды', () => {
      vi.useFakeTimers();
      ui.showToast('Код скопирован');
      const toast = document.querySelector('.toast');
      expect(toast.textContent).toBe('Код скопирован');
      vi.advanceTimersByTime(3000);
      expect(document.querySelector('.toast')).toBe(null);
    });
  });
});
