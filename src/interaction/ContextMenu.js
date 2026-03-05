/**
 * ContextMenu.js
 * 自定义右键菜单 — 手绘线条风格，与整体 UI 一致
 *
 * items 格式:
 *   { icon, label, action }          普通项
 *   { icon, label, action, checked } 可勾选项（checked 为 boolean 或 () => boolean）
 *   { type: 'separator' }            分割线
 */

export class ContextMenu {
  /**
   * @param {HTMLElement} trigger - 触发右键的元素
   * @param {Array} items - 菜单项列表
   */
  constructor(trigger, items) {
    this.trigger = trigger;
    this.items = items;
    this._menu = null;

    this._onContextMenu = this._onContextMenu.bind(this);
    this._dismiss = this._dismiss.bind(this);
    this.trigger.addEventListener('contextmenu', this._onContextMenu);
  }

  _onContextMenu(e) {
    e.preventDefault();
    this._show(e.clientX, e.clientY);
  }

  _show(x, y) {
    this._dismiss();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';

    for (const item of this.items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        menu.appendChild(sep);
        continue;
      }

      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      const checked = typeof item.checked === 'function' ? item.checked() : item.checked;
      if (checked) btn.classList.add('checked');

      btn.innerHTML = `
        <span class="ctx-icon">${item.icon || ''}</span>
        <span class="ctx-label">${item.label}</span>
        ${checked !== undefined ? `<span class="ctx-check">${checked ? '✓' : ''}</span>` : ''}
      `;

      btn.addEventListener('click', () => {
        this._dismiss();
        item.action?.();
      });

      menu.appendChild(btn);
    }

    // 先挂载再定位（需要 getBoundingClientRect）
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);
    this._menu = menu;

    // 防止超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth)  menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';

    // 入场动画
    requestAnimationFrame(() => menu.classList.add('visible'));

    // 点击外部或按 Esc 关闭（用 click 而非 mousedown，避免 mousedown 时移除 DOM 导致按钮 click 不触发）
    setTimeout(() => {
      document.addEventListener('click', this._dismiss, { once: true });
    }, 0);
    document.addEventListener('keydown', this._onKeyDown = (e) => {
      if (e.key === 'Escape') this._dismiss();
    }, { once: true });
  }

  _dismiss() {
    if (!this._menu) return;
    this._menu.remove();
    this._menu = null;
    document.removeEventListener('click', this._dismiss);
  }

  destroy() {
    this._dismiss();
    this.trigger.removeEventListener('contextmenu', this._onContextMenu);
  }
}
