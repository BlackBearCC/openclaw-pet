/**
 * StreamingBubble.js
 * 流式多段气泡 — AI 回复按标点分段，逐段浮现，旧段缩小淡出上移
 */

import { splitAtPunctuation } from '../utils/textSplitter.js';

export class StreamingBubble {
  /**
   * @param {HTMLElement} container - #bubble-container
   * @param {import('./Bubble').Bubble} simpleBubble - 普通气泡（流式期间隐藏）
   */
  constructor(container, simpleBubble) {
    this.container = container;
    this.simpleBubble = simpleBubble;

    this.maxVisibleSegments = 4;
    this.segments = [];        // { el, text }
    this.pendingText = '';     // 未到标点的缓冲
    this.lastFullText = '';    // 上次 appendText 收到的全文（用于 diff）
    this.isActive = false;
    this.hideTimer = null;

    // 容器 DOM
    this.wrapEl = document.createElement('div');
    this.wrapEl.className = 'stream-segments-container';
    this.wrapEl.style.display = 'none';
    this.container.appendChild(this.wrapEl);

    // 当前正在打字的段
    this.currentEl = null;
  }

  /** 开始新一轮流式输出 */
  start() {
    this._clearHideTimer();
    this.clear();
    this.isActive = true;
    this.wrapEl.style.display = '';
    // 隐藏普通气泡
    if (this.simpleBubble) this.simpleBubble.hide();
  }

  /**
   * 追加文本（接收累计全文，内部 diff）
   * @param {string} fullText - 当前累计的完整回复文本
   */
  appendText(fullText) {
    if (!this.isActive) return;
    const newChars = fullText.slice(this.lastFullText.length);
    if (!newChars) return;
    this.lastFullText = fullText;

    this.pendingText += newChars;
    this._processBuffer();
  }

  /** 流结束，刷出剩余文本 */
  finalize() {
    if (!this.isActive) return;

    // 把残余文本变成最后一段
    const rest = this.pendingText.trim();
    if (rest) {
      this._promoteCurrentSegment(rest);
    }
    this._removeCurrentEl();

    // 8 秒后自动隐藏
    this.hideTimer = setTimeout(() => this._fadeOutAll(), 8000);
  }

  /** 是否正在展示 */
  isVisible() { return this.isActive; }

  /** 清除所有段 */
  clear() {
    this._clearHideTimer();
    this.segments = [];
    this.pendingText = '';
    this.lastFullText = '';
    this.currentEl = null;
    this.isActive = false;
    this.wrapEl.innerHTML = '';
    this.wrapEl.style.display = 'none';
  }

  destroy() {
    this.clear();
    if (this.wrapEl.parentNode) this.wrapEl.parentNode.removeChild(this.wrapEl);
  }

  // ─── 内部方法 ───

  _processBuffer() {
    const { segments, remainder } = splitAtPunctuation(this.pendingText);

    for (const text of segments) {
      this._promoteCurrentSegment(text);
    }

    this.pendingText = remainder;
    // 更新"当前打字段"
    if (remainder) {
      this._updateCurrentEl(remainder);
    } else {
      this._removeCurrentEl();
    }
  }

  /** 将文本固化为一个正式段 */
  _promoteCurrentSegment(text) {
    this._removeCurrentEl();

    const el = document.createElement('div');
    el.className = 'stream-segment';
    el.textContent = text;
    this.wrapEl.appendChild(el);
    this.segments.push({ el, text });

    // 触发入场动画
    requestAnimationFrame(() => el.classList.add('visible'));

    // 超出上限 → 退休最老的
    while (this.segments.length > this.maxVisibleSegments) {
      this._retireOldest();
    }
  }

  /** 更新正在打字的临时段 */
  _updateCurrentEl(text) {
    if (!this.currentEl) {
      this.currentEl = document.createElement('div');
      this.currentEl.className = 'stream-segment current';
      this.wrapEl.appendChild(this.currentEl);
      requestAnimationFrame(() => this.currentEl?.classList.add('visible'));
    }
    this.currentEl.textContent = text;
  }

  _removeCurrentEl() {
    if (this.currentEl) {
      this.currentEl.remove();
      this.currentEl = null;
    }
  }

  /** 最老的段缩小淡出 */
  _retireOldest() {
    const oldest = this.segments.shift();
    if (!oldest) return;
    oldest.el.classList.add('retiring');
    oldest.el.addEventListener('transitionend', () => oldest.el.remove(), { once: true });
    // 保底移除（万一 transitionend 不触发）
    setTimeout(() => { if (oldest.el.parentNode) oldest.el.remove(); }, 600);
  }

  /** 全部淡出 */
  _fadeOutAll() {
    // 所有段同时淡出
    for (const { el } of this.segments) {
      el.classList.add('retiring');
    }
    if (this.currentEl) this.currentEl.classList.add('retiring');

    setTimeout(() => this.clear(), 600);
  }

  _clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
