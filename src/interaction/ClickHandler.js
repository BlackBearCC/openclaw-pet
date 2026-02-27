/**
 * ClickHandler.js
 * 点击交互 — 单击触发反应动画，双击打开聊天面板
 */

export class ClickHandler {
  /**
   * @param {HTMLElement} element
   * @param {import('../pet/StateMachine').StateMachine} stateMachine
   * @param {import('../pet/Behaviors').Behaviors} behaviors
   * @param {object} options
   */
  constructor(element, stateMachine, behaviors, options = {}) {
    this.element = element;
    this.sm = stateMachine;
    this.behaviors = behaviors;

    this.clickTimeout = null;
    this.clickDelay = 250; // 区分单击和双击的延迟

    this.onSingleClick = options.onSingleClick || null;
    this.onDoubleClick = options.onDoubleClick || null;

    this._onClick = this._onClick.bind(this);
    this._onDblClick = this._onDblClick.bind(this);

    this.element.addEventListener('click', this._onClick);
    this.element.addEventListener('dblclick', this._onDblClick);
  }

  _onClick(e) {
    // 延迟执行，以判断是否为双击
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
      return; // 双击的第二次点击，由 dblclick 处理
    }

    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = null;
      this._handleSingleClick(e);
    }, this.clickDelay);
  }

  _onDblClick(e) {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
    this._handleDoubleClick(e);
  }

  _handleSingleClick(e) {
    this.behaviors.recordInteraction();

    // 播放点击反应动画（500ms）
    this.sm.transition('click_react', { force: true, duration: 500 });

    if (this.onSingleClick) {
      this.onSingleClick(e);
    }
  }

  _handleDoubleClick(e) {
    this.behaviors.recordInteraction();

    // 播放开心动画
    this.sm.transition('happy', { force: true, duration: 800 });

    if (this.onDoubleClick) {
      this.onDoubleClick(e);
    }
  }

  destroy() {
    if (this.clickTimeout) clearTimeout(this.clickTimeout);
    this.element.removeEventListener('click', this._onClick);
    this.element.removeEventListener('dblclick', this._onDblClick);
  }
}
