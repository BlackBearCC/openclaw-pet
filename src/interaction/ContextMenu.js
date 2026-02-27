/**
 * ContextMenu.js
 * 右键菜单 — 通过 Electron IPC 调用原生菜单
 */

export class ContextMenu {
  /**
   * @param {HTMLElement} element
   * @param {object} electronAPI - preload 暴露的 API
   * @param {import('../pet/Behaviors').Behaviors} behaviors
   */
  constructor(element, electronAPI, behaviors) {
    this.element = element;
    this.electronAPI = electronAPI;
    this.behaviors = behaviors;

    this._onContextMenu = this._onContextMenu.bind(this);
    this.element.addEventListener('contextmenu', this._onContextMenu);
  }

  _onContextMenu(e) {
    e.preventDefault();
    this.behaviors.recordInteraction();

    if (this.electronAPI && this.electronAPI.showContextMenu) {
      this.electronAPI.showContextMenu();
    }
  }

  destroy() {
    this.element.removeEventListener('contextmenu', this._onContextMenu);
  }
}
