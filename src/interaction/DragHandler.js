/**
 * DragHandler.js
 * 拖拽逻辑 — 让用户可以拖动宠物到桌面任意位置
 *
 * 实现：
 * - mousedown 开始拖拽，切换到 drag 状态
 * - mousemove 移动 Electron 窗口位置
 * - mouseup 结束拖拽，回到 idle
 */

export class DragHandler {
  /**
   * @param {HTMLElement} element - 拖拽触发元素（canvas）
   * @param {import('../pet/StateMachine').StateMachine} stateMachine
   * @param {import('../pet/Behaviors').Behaviors} behaviors
   * @param {object} electronAPI - preload 暴露的 Electron API
   */
  constructor(element, stateMachine, behaviors, electronAPI) {
    this.element = element;
    this.sm = stateMachine;
    this.behaviors = behaviors;
    this.electronAPI = electronAPI;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    this.element.addEventListener('mousedown', this._onMouseDown);
  }

  _onMouseDown(e) {
    if (e.button !== 0) return; // 只响应左键

    this.isDragging = true;
    this.dragStartX = e.screenX;
    this.dragStartY = e.screenY;

    // 切换到拖拽状态
    this.sm.transition('drag', { force: true });
    this.behaviors.recordInteraction();

    // 通知 Electron 开始拖拽窗口
    if (this.electronAPI && this.electronAPI.startDrag) {
      this.electronAPI.startDrag();
    }

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    if (!this.isDragging) return;

    const dx = e.screenX - this.dragStartX;
    const dy = e.screenY - this.dragStartY;

    // 通知 Electron 移动窗口
    if (this.electronAPI && this.electronAPI.moveWindow) {
      this.electronAPI.moveWindow(dx, dy);
    }

    this.dragStartX = e.screenX;
    this.dragStartY = e.screenY;
  }

  _onMouseUp(e) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.sm.transition('idle', { force: true });

    // 更新 behaviors 中的位置信息
    if (this.electronAPI && this.electronAPI.getWindowPosition) {
      this.electronAPI.getWindowPosition().then(pos => {
        this.behaviors.setPosition(pos.x, pos.y);
      });
    }

    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }

  destroy() {
    this.element.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }
}
