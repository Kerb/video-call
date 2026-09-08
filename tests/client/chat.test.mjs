// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Chat } from '../../client/chat.js';

function setupDom() {
  document.body.innerHTML = `
    <input id="chat-input" />
    <button id="send-chat-btn">➤</button>
    <div id="chat-messages"></div>
  `;
}

function makeApp() {
  return {
    sessionId: 'me',
    ui: { showError: vi.fn(), showTyping: vi.fn() },
    socket: { sendChatMessage: vi.fn(), sendTyping: vi.fn() }
  };
}

describe('Chat', () => {
  let app;
  let chat;

  beforeEach(() => {
    vi.useRealTimers();
    setupDom();
    app = makeApp();
    chat = new Chat(app);
    chat.init();
  });

  const typeText = (text) => {
    document.getElementById('chat-input').value = text;
  };

  it('не отправляет пустое сообщение', () => {
    typeText('   ');
    chat.sendMessage();
    expect(app.socket.sendChatMessage).not.toHaveBeenCalled();
  });

  it('показывает ошибку для сообщения длиннее 1000 символов', () => {
    typeText('x'.repeat(1001));
    chat.sendMessage();
    expect(app.ui.showError).toHaveBeenCalled();
    expect(app.socket.sendChatMessage).not.toHaveBeenCalled();
  });

  it('отправляет валидное сообщение и очищает поле', () => {
    typeText('  hello  ');
    chat.sendMessage();
    expect(app.socket.sendChatMessage).toHaveBeenCalledWith('hello');
    expect(document.getElementById('chat-input').value).toBe('');
  });

  it('отправляет по Enter и по кнопке', () => {
    typeText('по энтеру');
    document.getElementById('chat-input')
      .dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
    expect(app.socket.sendChatMessage).toHaveBeenCalledTimes(1);

    typeText('по кнопке');
    document.getElementById('send-chat-btn').click();
    expect(app.socket.sendChatMessage).toHaveBeenCalledTimes(2);
  });

  it('onMessageReceived прокидывает сообщение в UI', () => {
    app.ui.addChatMessage = vi.fn();
    chat.onMessageReceived({ sessionId: 'other', name: 'Bob', text: 'hi', timestamp: 1 });
    expect(app.ui.addChatMessage).toHaveBeenCalledWith('other', 'Bob', 'hi', 1);
  });

  it('onTypingReceived игнорирует свой sessionId', () => {
    chat.onTypingReceived({ sessionId: 'me', name: 'Я' });
    expect(app.ui.showTyping).not.toHaveBeenCalled();

    chat.onTypingReceived({ sessionId: 'other', name: 'Bob' });
    expect(app.ui.showTyping).toHaveBeenCalledWith('Bob');
  });

  it('handleTyping шлёт typing не чаще раза в секунду', () => {
    vi.useFakeTimers();
    const input = document.getElementById('chat-input');

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.socket.sendTyping).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.socket.sendTyping).toHaveBeenCalledTimes(2);
  });
});
