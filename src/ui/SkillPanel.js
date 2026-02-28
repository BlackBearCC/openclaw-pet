/**
 * SkillPanel.js
 * 技能图鉴面板 — 浏览 OpenClaw 全部已加载技能
 *
 * 模式与 SettingsPanel 一致：
 * - 右键菜单 → 「🎒 技能图鉴」
 * - fixed 定位面板，CSS 过渡动画
 * - 按 source（core/plugin）分类展示技能卡片
 */

export class SkillPanel {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this.isOpen = false;
    this._tools = [];
    this._createDOM();
  }

  _createDOM() {
    this.element = document.createElement('div');
    this.element.id = 'skill-panel';
    this.element.innerHTML = `
      <div class="skill-header">
        <span>\u{1F392} 技能图鉴</span>
        <button class="skill-close">\u2715</button>
      </div>
      <div class="skill-body">
        <div class="skill-loading">加载中...</div>
      </div>
    `;
    this.element.querySelector('.skill-close').onclick = () => this.close();
    document.body.appendChild(this.element);
  }

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.element.classList.add('open');
    this.electronAPI?.expandWindow(true);
    await this._loadTools();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove('open');
    this.electronAPI?.expandWindow(false);
  }

  async _loadTools() {
    const body = this.element.querySelector('.skill-body');
    try {
      const result = await this.electronAPI.toolsCatalog();
      this._tools = result?.tools || [];
      this._renderTools(body);
    } catch {
      body.innerHTML = '<div class="skill-empty">暂无技能数据（Gateway 未连接）</div>';
    }
  }

  _renderTools(body) {
    if (!this._tools.length) {
      body.innerHTML = '<div class="skill-empty">暂无已加载技能</div>';
      return;
    }

    // 按 source 分组
    const core = this._tools.filter(t => t.source === 'core');
    const plugin = this._tools.filter(t => t.source !== 'core');

    body.innerHTML = `
      <div class="skill-count">共 ${this._tools.length} 个技能</div>
      ${this._renderSection('核心能力', core)}
      ${plugin.length ? this._renderSection('插件扩展', plugin) : ''}
    `;
  }

  _renderSection(title, tools) {
    if (!tools.length) return '';
    return `
      <div class="skill-section-title">${title}</div>
      <div class="skill-grid">
        ${tools.map(t => this._renderCard(t)).join('')}
      </div>
    `;
  }

  _renderCard(t) {
    const desc = t.description
      ? this._escapeHtml(t.description.slice(0, 60))
      : '\u2014';
    const name = this._escapeHtml(t.name);
    const pluginTag = t.pluginId
      ? `<span class="skill-tag plugin">${this._escapeHtml(t.pluginId)}</span>`
      : '';
    return `
      <div class="skill-card" title="${this._escapeHtml(t.description || '')}">
        <div class="skill-card-name">${name}</div>
        <div class="skill-card-desc">${desc}</div>
        ${pluginTag}
      </div>
    `;
  }

  _escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  destroy() {
    this.element?.remove();
  }
}
