/**
 * StreamingBubble.js
 * 流式多段气泡 — AI 回复按标点分段，逐段浮现，旧段缩小淡出上移
 *
 * 位于宠物头顶，段从下往上堆叠
 */

import { splitAtPunctuation } from '../utils/textSplitter.js';

export class StreamingBubble {
  /**
   * @param {HTMLElement} petArea - #pet-area
   * @param {import('./Bubble').Bubble} simpleBubble - 普通气泡（流式期间隐藏）
   */
  constructor(petArea, simpleBubble) {
    this.petArea = petArea;
    this.simpleBubble = simpleBubble;

    this.segments = [];        // { el, text }
    this.pendingText = '';     // 未到标点的缓冲
    this.lastFullText = '';    // 上次 appendText 收到的全文（用于 diff）
    this.isActive = false;
    this.hideTimer = null;

    // 容器 DOM — 直接挂在 pet-area 上
    this.wrapEl = document.createElement('div');
    this.wrapEl.className = 'stream-segments-container';
    this.wrapEl.style.display = 'none';
    this.petArea.appendChild(this.wrapEl);

    // 当前正在打字的段
    this.currentEl = null;
  }

  /** 兼容调用（位置现在固定在头顶） */
  updateSide() {}

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
  }

  /** 是否正在展示 */
  isVisible() { return this.isActive; }

  /** 清除所有段 */
  clear() {
    this._clearHideTimer();
    for (const seg of this.segments) {
      if (seg.timer) clearTimeout(seg.timer);
    }
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
    const seg = { el, text, timer: null };
    this.segments.push(seg);

    // 触发入场动画
    requestAnimationFrame(() => el.classList.add('visible'));

    // 5 秒后自动退休
    seg.timer = setTimeout(() => this._retireSegment(seg), 5000);
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

  /** 指定段缩小淡出 */
  _retireSegment(seg) {
    const idx = this.segments.indexOf(seg);
    if (idx >= 0) this.segments.splice(idx, 1);
    seg.el.classList.add('retiring');
    setTimeout(() => { if (seg.el.parentNode) seg.el.remove(); }, 600);

    // 所有段都退完且流已结束 → 隐藏容器
    if (this.segments.length === 0 && !this.currentEl) {
      setTimeout(() => {
        if (this.segments.length === 0) this.clear();
      }, 700);
    }
  }

  _clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
