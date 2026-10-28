/*
 * Portable browser chat widget.
 *
 * Configure window.CHATBOT_CONFIG before loading this file:
 * {
 *   endpoint: "http://localhost:3000/api/chat",
 *   title: "Assistant",
 *   welcomeMessage: "Hi! How can I help?",
 *   maxHistory: 12
 * }
 *
 * The endpoint receives { messages: [{ role, content }, ...] } and should
 * return JSON with a string property named "reply" or "assistant".
 * Keep AI credentials and MySQL access in that server endpoint, never here.
 */
(function () {
  'use strict';

  function createChatbot(options) {
    const config = Object.assign({
      endpoint: '/api/chat',
      title: 'Assistant',
      welcomeMessage: 'Hi! How can I help?',
      placeholder: 'Type a message...',
      maxHistory: 12,
      headers: {}
    }, options || {});

    if (typeof config.endpoint !== 'string' || !config.endpoint.trim()) {
      throw new Error('Chatbot requires a non-empty endpoint URL.');
    }

    const maxHistory = Number.isInteger(config.maxHistory) && config.maxHistory > 0
      ? config.maxHistory
      : 12;
    const history = [];
    const host = document.createElement('div');
    host.setAttribute('aria-label', 'Chat assistant');
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .chat-widget {
          color: #17202a;
          font: 14px/1.45 Arial, sans-serif;
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 2147483000;
        }
        .chat-toggle {
          background: #1769aa;
          border: 0;
          border-radius: 999px;
          box-shadow: 0 4px 14px #0003;
          color: white;
          cursor: pointer;
          font: inherit;
          font-weight: 600;
          min-height: 48px;
          padding: 0 20px;
        }
        .chat-panel {
          background: white;
          border: 1px solid #d6dce2;
          border-radius: 12px;
          bottom: 60px;
          box-shadow: 0 8px 32px #0003;
          display: flex;
          flex-direction: column;
          height: min(520px, calc(100vh - 110px));
          overflow: hidden;
          position: absolute;
          right: 0;
          width: min(360px, calc(100vw - 32px));
        }
        .chat-panel[hidden] { display: none; }
        .chat-header {
          align-items: center;
          background: #1769aa;
          color: white;
          display: flex;
          justify-content: space-between;
          padding: 12px 14px;
        }
        .chat-title { font-size: 16px; font-weight: 700; margin: 0; }
        .chat-header button {
          background: transparent;
          border: 0;
          color: inherit;
          cursor: pointer;
          font: inherit;
          font-size: 20px;
          line-height: 1;
          padding: 4px;
        }
        .chat-messages {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          padding: 14px;
        }
        .chat-message {
          border-radius: 12px;
          max-width: 88%;
          padding: 9px 12px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .chat-message.assistant { align-self: flex-start; background: #eef2f6; }
        .chat-message.user { align-self: flex-end; background: #1769aa; color: white; }
        .chat-message.error {
          align-self: stretch;
          background: #fff0f0;
          color: #9c1c1c;
          font-size: 13px;
        }
        .chat-form {
          align-items: flex-end;
          border-top: 1px solid #e3e7eb;
          display: flex;
          gap: 8px;
          padding: 10px;
        }
        .chat-input {
          border: 1px solid #b9c2cc;
          border-radius: 8px;
          color: #17202a;
          flex: 1;
          font: inherit;
          max-height: 100px;
          min-height: 40px;
          padding: 9px;
          resize: vertical;
        }
        .chat-send {
          background: #1769aa;
          border: 0;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font: inherit;
          min-height: 40px;
          padding: 0 13px;
        }
        .chat-send:disabled { cursor: wait; opacity: .65; }
        button:focus-visible, textarea:focus-visible {
          outline: 3px solid #f3b61f;
          outline-offset: 2px;
        }
        @media (max-width: 480px) {
          .chat-widget { bottom: 12px; right: 12px; }
          .chat-panel {
            bottom: 58px;
            height: min(520px, calc(100vh - 86px));
            position: fixed;
            right: 12px;
            width: calc(100vw - 24px);
          }
        }
      </style>
      <div class="chat-widget">
        <section class="chat-panel" aria-label="Chat conversation" hidden>
          <header class="chat-header">
            <h2 class="chat-title"></h2>
            <button class="chat-close" type="button" aria-label="Close chat">&times;</button>
          </header>
          <div class="chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
          <form class="chat-form">
            <textarea class="chat-input" rows="1" aria-label="Message" required></textarea>
            <button class="chat-send" type="submit">Send</button>
          </form>
        </section>
        <button class="chat-toggle" type="button" aria-expanded="false">Chat</button>
      </div>
    `;

    const panel = shadow.querySelector('.chat-panel');
    const toggle = shadow.querySelector('.chat-toggle');
    const close = shadow.querySelector('.chat-close');
    const messages = shadow.querySelector('.chat-messages');
    const form = shadow.querySelector('.chat-form');
    const input = shadow.querySelector('.chat-input');
    const send = shadow.querySelector('.chat-send');

    shadow.querySelector('.chat-title').textContent = config.title;
    input.placeholder = config.placeholder;
    toggle.setAttribute('aria-controls', 'chat-conversation');
    panel.id = 'chat-conversation';

    function addMessage(text, role) {
      const message = document.createElement('div');
      message.className = `chat-message ${role}`;
      message.textContent = text;
      messages.appendChild(message);
      messages.scrollTop = messages.scrollHeight;
      return message;
    }

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) input.focus();
    }

    toggle.addEventListener('click', function () {
      setOpen(panel.hidden);
    });
    close.addEventListener('click', function () {
      setOpen(false);
      toggle.focus();
    });

    if (typeof config.welcomeMessage === 'string' && config.welcomeMessage) {
      addMessage(config.welcomeMessage, 'assistant');
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || send.disabled) return;

      addMessage(text, 'user');
      input.value = '';
      send.disabled = true;
      const pendingMessage = addMessage('Thinking…', 'assistant');

      const userMessage = { role: 'user', content: text };
      history.push(userMessage);
      if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

      try {
        const extraHeaders = typeof config.headers === 'function'
          ? await config.headers()
          : config.headers;
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}),
          body: JSON.stringify({ messages: history })
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Chat request failed (${response.status}).`);
        }

        const data = await response.json();
        const reply = typeof data.reply === 'string'
          ? data.reply
          : typeof data.assistant === 'string'
            ? data.assistant
            : '';
        if (!reply.trim()) throw new Error('The chat server returned an empty reply.');

        history.push({ role: 'assistant', content: reply });
        if (history.length > maxHistory) history.splice(0, history.length - maxHistory);
        pendingMessage.textContent = reply;
      } catch (error) {
        history.pop();
        pendingMessage.remove();
        addMessage(
          `Sorry, I couldn't reach the chat service. ${error.message || 'Please try again.'}`,
          'error'
        );
        console.error('Chat request failed:', error);
      } finally {
        send.disabled = false;
        input.focus();
      }
    });

    return {
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      destroy: function () { host.remove(); }
    };
  }

  window.createChatbot = createChatbot;

  function autoStart() {
    const config = window.CHATBOT_CONFIG || {};
    if (config.autoStart === false) return;
    window.chatbot = createChatbot(config);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart, { once: true });
  } else {
    autoStart();
  }
})();
