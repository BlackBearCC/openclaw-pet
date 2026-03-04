/**
 * BottomChatInput.js
 * 底部快捷聊天 — 浮动图标 + 紧凑输入框，AI 回复通过 StreamingBubble 展示
 *
 * 图标位置根据宠物在屏幕左/右侧动态切换。
 */

export class BottomChatInput {
  /**
   * @param {HTMLElement} petArea - #pet-area
   * @param {object} electronAPI
   * @param {import('../pet/StateMachine').StateMachine} stateMachine
   * @param {import('./StreamingBubble').StreamingBubble} streamingBubble
   */
  constructor(petArea, electronAPI, stateMachine, streamingBubble) {
    this.petArea = petArea;
    this.electronAPI = electronAPI;
    this.sm = stateMachine;
    this.streamingBubble = streamingBubble;

    this.isOpen = false;
    this.isSending = false;
    this.activeRunId = null;
    this.streamedText = '';

    // 当前图标位置: 'left' | 'right'
    this._iconSide = 'left';

    this._createDOM();
    this._setupStreamListener();
  }

  _createDOM() {
    // 浮动聊天图标
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'bottom-chat-toggle';
    this.toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.petArea.appendChild(this.toggleBtn);

    // 输入栏
    this.barEl = document.createElement('div');
    this.barEl.className = 'bottom-chat-input';
    this.barEl.innerHTML = `
      <input type="text" class="bottom-chat-field" placeholder="说点什么喵~" />
      <button class="bottom-chat-send">➤</button>
    `;
    this.petArea.appendChild(this.barEl);

    this.inputEl = this.barEl.querySelector('.bottom-chat-field');
    this.sendBtn = this.barEl.querySelector('.bottom-chat-send');

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      if (e.key === 'Escape') this.close();
    });
    this.sendBtn.addEventListener('click', () => this._send());
  }

  /** 更新图标位置（由 app.js 在位置变化时调用） */
  updateSide(side) {
    if (side === this._iconSide) return;
    this._iconSide = side;
    this.toggleBtn.classList.toggle('right', side === 'right');
    this.barEl.classList.toggle('right', side === 'right');
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.barEl.classList.add('open');
    this.toggleBtn.classList.add('active');
    // 扩展窗口（向上微扩 54px）
    if (this.electronAPI?.expandWindow) {
      this.electronAPI.expandWindow(true, { width: 256, height: 310 });
    }
    setTimeout(() => this.inputEl.focus(), 260);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.barEl.classList.remove('open');
    this.toggleBtn.classList.remove('active');
    this.inputEl.value = '';
    if (this.electronAPI?.expandWindow) {
      this.electronAPI.expandWindow(false);
    }
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  // ─── AI 通信 ───

  _setupStreamListener() {
    if (!this.electronAPI?.onChatStream) return;

    this.electronAPI.onChatStream((payload) => {
      if (!payload || !this.activeRunId) return;
      if (payload.runId !== this.activeRunId) return;

      if (payload.state === 'delta') {
        const text = this._extractText(payload.message);
        if (text) {
          this.streamedText = text;
          this.streamingBubble.appendText(text);
          this.sm.transition('talk', { force: true, duration: 500 });
        }
      }

      if (payload.state === 'final') {
        const finalText = this._extractText(payload.message) || this.streamedText || '喵？';
        this.streamingBubble.appendText(finalText);
        this.streamingBubble.finalize();
        this._finishSending(finalText);
      }

      if (payload.state === 'error') {
        this.streamingBubble.appendText(payload.errorMessage || '出错了喵~');
        this.streamingBubble.finalize();
        this._finishSending(null);
      }

      if (payload.state === 'aborted') {
        this.streamingBubble.finalize();
        this._finishSending(null);
      }
    });
  }

  async _send() {
    const text = this.inputEl.value.trim();
    if (!text || this.isSending) return;

    this.inputEl.value = '';
    this.isSending = true;
    this.sendBtn.disabled = true;
    this.streamedText = '';

    // 启动流式气泡
    this.streamingBubble.start();
    this.sm.transition('talk', { force: true, duration: 2000 });

    if (this.electronAPI?.chatSend) {
      try {
        const result = await this.electronAPI.chatSend(text);
        this.activeRunId = result.runId;
      } catch (e) {
        // fallback 旧接口
        await this._sendLegacy(text);
      }
    } else if (this.electronAPI?.chatWithAI) {
      await this._sendLegacy(text);
    }
  }

  async _sendLegacy(text) {
    try {
      const resp = await this.electronAPI.chatWithAI(text);
      this.streamingBubble.appendText(resp.text || '喵？');
      this.streamingBubble.finalize();
      this._finishSending(resp.text);
    } catch (e) {
      this.streamingBubble.appendText(`出错了: ${e.message}`);
      this.streamingBubble.finalize();
      this._finishSending(null);
    }
  }

  _finishSending(text) {
    this.isSending = false;
    this.activeRunId = null;
    this.sendBtn.disabled = false;
    if (text) {
      this.sm.transition('happy', { force: true, duration: 3000 });
    } else {
      this.sm.transition('idle', { force: true });
    }
  }

  _extractText(message) {
    if (!message) return '';
    let content = message;
    if (typeof message === 'object' && message.content !== undefined) content = message.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .filter(b => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('\n')
        .trim();
    }
    return String(content);
  }

  destroy() {
    this.close();
    this.toggleBtn.remove();
    this.barEl.remove();
  }
}
