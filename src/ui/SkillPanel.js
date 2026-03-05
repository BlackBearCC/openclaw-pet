/**
 * SkillPanel.js
 * 四栏图鉴面板 — 工具 / 技能 / 分身 / 成就
 *
 * - 工具图鉴：Gateway tools.catalog + 解锁星级
 * - 技能图鉴：按工具类别聚合的技能分类，根据使用解锁
 * - 分身图鉴：Agent sessions 历史记录 + 战绩统计
 * - 成就图鉴：12 个徽章成就
 */

// 技能分类：把工具归入更高层的技能
export const SKILL_CATEGORIES = [
  { name: '信息检索',  icon: '🔍', keys: ['web_search', 'fetch', 'browser', 'websearch'] },
  { name: '代码编写',  icon: '💻', keys: ['read', 'write', 'edit', 'read_file', 'write_file'] },
  { name: '代码搜索',  icon: '🔎', keys: ['grep', 'glob', 'search'] },
  { name: '系统操作',  icon: '⚡', keys: ['bash', 'exec', 'shell', 'terminal'] },
  { name: '文档处理',  icon: '📄', keys: ['pdf', 'image', 'canvas'] },
  { name: '社交通信',  icon: '💬', keys: ['discord', 'slack', 'telegram'] },
  { name: '定时任务',  icon: '⏰', keys: ['cron', 'schedule'] },
];

export class SkillPanel {
  constructor(electronAPI, skillSystem = null, agentStatsTracker = null, achievementSystem = null) {
    this.electronAPI = electronAPI;
    this.skillSystem = skillSystem;
    this.agentStatsTracker = agentStatsTracker;
    this.achievementSystem = achievementSystem;
    this.isOpen = false;
    this._tools = [];
    this._activeTab = 'tools';
    this._createDOM();
  }

  _createDOM() {
    this.element = document.createElement('div');
    this.element.id = 'skill-panel';
    this.element.innerHTML = `
      <div class="skill-header">
        <span>📖 图鉴</span>
        <button class="skill-close">✕</button>
      </div>
      <div class="almanac-tabs">
        <button class="almanac-tab active" data-tab="tools">\uD83D\uDD27 \u5DE5\u5177</button>
        <button class="almanac-tab" data-tab="skills">\uD83C\uDFAF \u6280\u80FD</button>
        <button class="almanac-tab" data-tab="agents">\uD83D\uDC31 \u5206\u8EAB</button>
        <button class="almanac-tab" data-tab="achievements">\uD83C\uDFC6 \u6210\u5C31</button>
      </div>
      <div class="skill-body">
        <div class="skill-loading">\u52A0\u8F7D\u4E2D...</div>
      </div>
    `;
    this.element.querySelector('.skill-close').onclick = () => this.close();
    this.element.querySelectorAll('.almanac-tab').forEach(btn => {
      btn.onclick = () => this._switchTab(btn.dataset.tab);
    });
    document.body.appendChild(this.element);
  }

  async open() {
    this.isOpen = true;
    this.element.classList.add('open');
    await this._loadAndRender();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove('open');
  }

  closeQuiet() {
    this.close();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  async _switchTab(tab) {
    this._activeTab = tab;
    this.element.querySelectorAll('.almanac-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    await this._loadAndRender();
  }

  async _loadAndRender() {
    const body = this.element.querySelector('.skill-body');
    body.innerHTML = '<div class="skill-loading">\u52A0\u8F7D\u4E2D...</div>';

    if (this._activeTab === 'tools') {
      await this._renderToolsTab(body);
    } else if (this._activeTab === 'skills') {
      this._renderSkillsTab(body);
    } else if (this._activeTab === 'agents') {
      await this._renderAgentsTab(body);
    } else if (this._activeTab === 'achievements') {
      this._renderAchievementsTab(body);
    }
  }

  // ===== 工具图鉴 =====
  async _renderToolsTab(body) {
    try {
      const result = await this.electronAPI.toolsCatalog();
      this._tools = result?.tools || [];
    } catch {
      this._tools = [];
    }

    // 合并 catalog + 实际使用记录
    const catalogNames = new Set(this._tools.map(t => t.name));
    const unlockData = this.skillSystem?.getToolData() || {};
    const extraTools = [];
    for (const [name, info] of Object.entries(unlockData)) {
      if (!catalogNames.has(name)) {
        extraTools.push({ name, description: `已使用 ${info.count} 次`, source: 'recorded' });
      }
    }
    const allTools = [...this._tools, ...extraTools];

    if (!allTools.length) {
      body.innerHTML = '<div class="skill-empty">暂无工具数据</div>';
      return;
    }

    const core = this._tools.filter(t => t.source === 'core');
    const plugin = this._tools.filter(t => t.source !== 'core' && t.source !== 'recorded');
    const unlocked = Object.keys(unlockData).length;

    body.innerHTML = `
      <div class="skill-count">共 ${allTools.length} 个工具（已解锁 ${unlocked}）</div>
      ${this._renderSection('核心工具', core)}
      ${plugin.length ? this._renderSection('插件工具', plugin) : ''}
      ${extraTools.length ? this._renderSection('已使用工具', extraTools) : ''}
    `;
  }

  // ===== 技能图鉴 =====
  _renderSkillsTab(body) {
    const realizedSkills = this.skillSystem?.getRealizedSkills() || [];

    // 按分类统计领悟技能数量
    const countByDomain = {};
    for (const s of realizedSkills) {
      countByDomain[s.domainName] = (countByDomain[s.domainName] || 0) + 1;
    }

    const catCards = SKILL_CATEGORIES.map(cat => {
      const count = countByDomain[cat.name] || 0;
      const unlocked = count > 0;
      const stars = count >= 7 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0;
      const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      return `
        <div class="book-domain-card ${unlocked ? '' : 'book-domain-locked'}">
          <span class="book-domain-icon">${cat.icon}</span>
          <span class="book-domain-name">${cat.name}</span>
          <span class="book-domain-stars">${unlocked ? starStr : '🔒'}</span>
        </div>
      `;
    }).join('');

    const unlockedCount = SKILL_CATEGORIES.filter(cat => countByDomain[cat.name] > 0).length;

    const realizedHtml = realizedSkills.length === 0
      ? '<div class="book-empty-hint">还没有领悟任何技能，<br>多使用工具探索世界吧~ 🐾</div>'
      : realizedSkills.slice().reverse().map((s, i) => {
          const date = new Date(s.realizedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
          return `
            <div class="book-skill-entry" data-idx="${realizedSkills.length - 1 - i}">
              <div class="book-skill-entry-title">✦ ${this._escapeHtml(s.skillTitle)}</div>
              <div class="book-skill-entry-meta">${this._escapeHtml(s.domainName)} · ${date}</div>
              <div class="book-skill-entry-summary">${this._escapeHtml(s.summary)}</div>
              <div class="book-skill-entry-arrow">›</div>
            </div>
          `;
        }).join('');

    body.innerHTML = `
      <div class="book-section-title">技能领域</div>
      <div class="book-domain-grid">${catCards}</div>
      <div class="book-divider">✦ ✦ ✦</div>
      <div class="book-section-title">领悟卷轴 <span class="book-count">${realizedSkills.length} / ∞</span></div>
      ${realizedHtml}
    `;

    // 绑定点击详情
    body.querySelectorAll('.book-skill-entry').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        this._showSkillDetail(realizedSkills[idx], body);
      };
    });
  }

  _showSkillDetail(skill, body) {
    const date = new Date(skill.realizedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    const content = this._escapeHtml(skill.skillContent || skill.skillDesc || '（无详细内容）');

    const detail = document.createElement('div');
    detail.className = 'book-detail-page';
    detail.innerHTML = `
      <button class="book-detail-back">‹ 返回</button>
      <div class="book-detail-domain">${this._escapeHtml(skill.domainName)} · ${date}</div>
      <div class="book-detail-title">✦ ${this._escapeHtml(skill.skillTitle)}</div>
      <div class="book-detail-divider"></div>
      <div class="book-detail-content">${content.replace(/\n/g, '<br>')}</div>
      <div class="book-detail-summary-label">— 心得 —</div>
      <div class="book-detail-summary">${this._escapeHtml(skill.summary)}</div>
    `;
    detail.querySelector('.book-detail-back').onclick = () => detail.remove();

    // 滑入
    body.appendChild(detail);
    requestAnimationFrame(() => detail.classList.add('visible'));
  }

  // ===== 分身图鉴 =====
  async _renderAgentsTab(body) {
    // 1. 获取持久化 agent 定义列表
    let agents = [];
    try {
      const result = await this.electronAPI.agentsList?.();
      agents = result?.agents || [];
    } catch { /* unsupported */ }

    // 2. 获取活跃 sub-sessions（排除 main，作为动态分身）
    let subSessions = [];
    try {
      const result = await this.electronAPI.getSessionsList();
      const all = result?.sessions || [];
      // 只要子 session（非 main 结尾）
      subSessions = all.filter(s => !s.key?.endsWith(':main'));
    } catch { /* gateway offline */ }

    // 3. 从 localStorage 加载历史 sub-session 记录
    const history = this._loadAgentHistory();
    const seenKeys = new Set(subSessions.map(s => s.key));
    for (const s of subSessions) {
      history[s.key] = {
        title: s.derivedTitle || s.title || s.key,
        lastSeen: Date.now(),
      };
    }
    this._saveAgentHistory(history);

    // 历史里不再活跃的
    const historyInactive = Object.entries(history)
      .filter(([k]) => !seenKeys.has(k))
      .map(([key, info]) => ({ key, derivedTitle: info.title, active: false, updatedAt: info.lastSeen }));

    const activeSubs = subSessions.map(s => ({ ...s, active: true }));
    const allSubs = [...activeSubs, ...historyInactive].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    // 渲染
    const agentCards = agents.map(a => `
      <div class="skill-card">
        <div class="skill-card-name">🤖 ${this._escapeHtml(a.id || a.name || '')}</div>
        <div class="skill-card-desc">${this._escapeHtml((a.description || a.model || '').slice(0, 60))}</div>
        <span class="skill-tag">${this._escapeHtml(a.model || 'agent')}</span>
      </div>
    `).join('');

    const subCards = allSubs.map(s => {
      const label = this._deriveAgentLabel(s);
      const status = s.active
        ? '<span class="agent-status active">\u25CF \u6D3B\u8DC3</span>'
        : '<span class="agent-status inactive">\u25CB \u79BB\u7EBF</span>';
      const time = s.updatedAt ? this._timeAgo(s.updatedAt) : '';

      // 战绩统计
      const stats = this.agentStatsTracker?.get(s.key);
      const statsHtml = stats ? `
        <div class="agent-stats-row">
          <span class="agent-stat-badge tools">\uD83D\uDD27\u00D7${stats.toolUsageCount}</span>
          ${stats.activeDurationMs ? `<span class="agent-stat-badge duration">\u23F1${this._formatDuration(stats.activeDurationMs)}</span>` : ''}
        </div>
        ${stats.uniqueTools.length ? `<div class="agent-unique-tools">${stats.uniqueTools.slice(0, 6).map(t => `<span class="agent-tool-chip">${this._escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ` : '';

      return `
        <div class="skill-card ${s.active ? '' : 'agent-inactive'}">
          <div class="skill-card-name">\uD83D\uDC31 ${this._escapeHtml(label)}</div>
          <div class="agent-meta">${status}${time ? ` <span class="agent-time">${time}</span>` : ''}</div>
          ${statsHtml}
        </div>
      `;
    }).join('');

    const totalAgents = agents.length;
    const totalSubs = allSubs.length;

    body.innerHTML = `
      <div class="skill-count">持久 Agent ${totalAgents} 个 · 子分身 ${totalSubs} 个（活跃 ${activeSubs.length}）</div>
      ${agents.length ? `<div class="skill-section-title">持久 Agents</div><div class="skill-grid">${agentCards}</div>` : ''}
      ${allSubs.length
        ? `<div class="skill-section-title">动态分身（子任务）</div><div class="skill-grid">${subCards}</div>`
        : '<div class="skill-empty">暂无动态分身记录</div>'
      }
    `;
  }

  // ===== 成就图鉴 =====
  _renderAchievementsTab(body) {
    const all = this.achievementSystem?.getAll() || [];
    const unlocked = all.filter(a => a.unlocked);
    const locked = all.filter(a => !a.unlocked);
    const sorted = [...unlocked.sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0)), ...locked];

    const cards = sorted.map(ach => {
      const dateStr = ach.unlockedAt
        ? new Date(ach.unlockedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      return `
        <div class="achievement-card ${ach.unlocked ? 'unlocked' : 'locked'}">
          <div class="achievement-icon">${ach.icon}</div>
          <div class="achievement-info">
            <div class="achievement-name">${this._escapeHtml(ach.name)}</div>
            <div class="achievement-desc">${this._escapeHtml(ach.desc)}</div>
            ${ach.unlocked
              ? `<div class="achievement-date">\u2705 ${dateStr}</div>`
              : '<div class="achievement-date">\uD83D\uDD12 \u672A\u89E3\u9501</div>'
            }
            ${ach.intimacyBonus > 0 ? `<div class="achievement-bonus">\u2764\uFE0F +${ach.intimacyBonus} \u4EB2\u5BC6\u5EA6</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <div class="skill-count">\u5171 ${all.length} \u4E2A\u6210\u5C31\uFF08\u5DF2\u89E3\u9501 ${unlocked.length}\uFF09</div>
      <div class="achievement-list">${cards}</div>
    `;
  }

  // ===== 渲染辅助 =====

  _formatDuration(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  _renderSection(title, tools) {
    if (!tools.length) return '';
    return `
      <div class="skill-section-title">${title}</div>
      <div class="skill-grid">
        ${tools.map(t => this._renderToolCard(t)).join('')}
      </div>
    `;
  }

  _renderToolCard(t) {
    const stars = this.skillSystem?.getToolStars(t.name) || 0;
    const locked = !!this.skillSystem && stars === 0;
    const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
    const desc = t.description ? this._escapeHtml(t.description.slice(0, 60)) : '\u2014';
    const name = this._escapeHtml(t.name);
    const count = this.skillSystem?.getToolData()[t.name]?.count || 0;
    const pluginTag = t.pluginId
      ? `<span class="skill-tag plugin">${this._escapeHtml(t.pluginId)}</span>`
      : '';

    return `
      <div class="skill-card ${locked ? 'skill-locked' : ''}" title="${this._escapeHtml(t.description || '')}">
        <div class="skill-card-name">${name}</div>
        ${locked
          ? '<div class="skill-card-locked-label">\uD83D\uDD12 尚未使用</div>'
          : `<div class="skill-card-stars" title="使用次数：${count}">${starStr}</div>
             <div class="skill-card-desc">${desc}</div>`
        }
        ${pluginTag}
      </div>
    `;
  }

  _deriveAgentLabel(session) {
    const raw = session.derivedTitle || session.title || session.key || '';
    const parts = raw.split(':');
    const name = parts[parts.length - 1] || raw;
    return name.length > 20 ? name.slice(0, 19) + '\u2026' : name;
  }

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  }

  _loadAgentHistory() {
    try { return JSON.parse(localStorage.getItem('agent-history') || '{}'); }
    catch { return {}; }
  }

  _saveAgentHistory(data) {
    localStorage.setItem('agent-history', JSON.stringify(data));
  }

  _escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  destroy() {
    this.element?.remove();
  }
}
