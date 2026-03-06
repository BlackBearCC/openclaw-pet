/**
 * SkillPanel.js
 * 四栏图鉴面板 — 工具 / 技能 / 分身 / 成就
 *
 * - 工具图鉴：Gateway tools.catalog + 解锁星级
 * - 技能图鉴：按工具类别聚合的技能分类，根据使用解锁
 * - 分身图鉴：Agent sessions 历史记录 + 战绩统计
 * - 成就图鉴：12 个徽章成就
 */

import { LEVEL_THRESHOLDS } from '../pet/LearningSystem.js';

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
  constructor(electronAPI, unlockSystem = null, agentStatsTracker = null, achievementSystem = null) {
    this.electronAPI = electronAPI;
    this.unlockSystem = unlockSystem;
    this.agentStatsTracker = agentStatsTracker;
    this.achievementSystem = achievementSystem;
    this.learningSystem = null;
    this.courseGenerator = null;
    this._onStartLesson = null; // callback: (courseId) => void
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
        <span>\uD83D\uDCD6 \u56FE\u9274</span>
        <button class="skill-close">\u2715</button>
      </div>
      <div class="almanac-tabs">
        <button class="almanac-tab active" data-tab="tools">\uD83D\uDD27 \u5DE5\u5177</button>
        <button class="almanac-tab" data-tab="skills">\uD83C\uDFAF \u6280\u80FD</button>
        <button class="almanac-tab" data-tab="agents">\uD83D\uDC31 \u5206\u8EAB</button>
        <button class="almanac-tab" data-tab="achievements">\uD83C\uDFC6 \u6210\u5C31</button>
        <button class="almanac-tab" data-tab="learning">\uD83D\uDCDA \u5B66\u4E60</button>
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
    } else if (this._activeTab === 'learning') {
      this._renderLearningTab(body);
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
    const unlockData = this.unlockSystem?.getData() || {};
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
    const unlockData = this.unlockSystem?.getData() || {};
    const allUsedKeys = Object.keys(unlockData).map(k => k.toLowerCase());

    const cards = SKILL_CATEGORIES.map(cat => {
      // 查找该技能分类下使用过的工具
      const matched = cat.keys.filter(k => allUsedKeys.some(u => u.includes(k)));
      const totalCount = cat.keys.reduce((sum, k) => {
        for (const [name, info] of Object.entries(unlockData)) {
          if (name.toLowerCase().includes(k)) sum += info.count;
        }
        return sum;
      }, 0);
      const unlocked = matched.length > 0;
      const stars = totalCount >= 20 ? 3 : totalCount >= 5 ? 2 : totalCount >= 1 ? 1 : 0;
      const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);

      return `
        <div class="skill-card ${unlocked ? '' : 'skill-locked'}">
          <div class="skill-card-name">${cat.icon} ${cat.name}</div>
          ${unlocked
            ? `<div class="skill-card-stars" title="累计使用 ${totalCount} 次">${starStr}</div>
               <div class="skill-card-desc">相关工具：${matched.join(', ')}</div>`
            : '<div class="skill-card-locked-label">\uD83D\uDD12 尚未触发</div>'
          }
        </div>
      `;
    }).join('');

    const unlockedCount = SKILL_CATEGORIES.filter(cat =>
      cat.keys.some(k => allUsedKeys.some(u => u.includes(k)))
    ).length;

    body.innerHTML = `
      <div class="skill-count">共 ${SKILL_CATEGORIES.length} 项技能（已解锁 ${unlockedCount}）</div>
      <div class="skill-grid">${cards}</div>
    `;
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

  // ===== 学习系统注入 =====

  setLearning(learningSystem, courseGenerator, onStartLesson) {
    this.learningSystem = learningSystem;
    this.courseGenerator = courseGenerator;
    this._onStartLesson = onStartLesson;
  }

  async openToLearning() {
    this.isOpen = true;
    this.element.classList.add('open');
    await this._switchTab('learning');
  }

  // ===== 学习图鉴 =====
  _renderLearningTab(body) {
    if (!this.learningSystem) {
      body.innerHTML = '<div class="skill-empty">学习系统未初始化</div>';
      return;
    }

    const ls = this.learningSystem;
    const activeLesson = ls.getActiveLesson();

    // 1. 正在学习中 → 显示进度
    let activeHtml = '';
    if (activeLesson) {
      const pct = Math.round(activeLesson.progress * 100);
      const remainMin = Math.ceil(activeLesson.remaining / 60000);
      activeHtml = `
        <div class="learn-active-card">
          <div class="learn-active-title">\uD83D\uDCDA 正在学习：${this._escapeHtml(activeLesson.courseTitle)}</div>
          <div class="learn-progress-bar">
            <div class="learn-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="learn-active-info">进度 ${pct}% · 剩余 ${remainMin} 分钟</div>
          <button class="learn-abort-btn">\u23F9 中断学习</button>
        </div>
      `;
    }

    // 2. 类别等级概览
    const levelCards = SKILL_CATEGORIES.map(cat => {
      const p = ls.getProgress(cat.name);
      const currentThreshold = LEVEL_THRESHOLDS[p.level - 1] || 0;
      const xpInLevel = p.xp - currentThreshold;
      const xpForNext = (p.nextXp === Infinity) ? 0 : (p.nextXp - currentThreshold);
      const pct = xpForNext > 0 ? Math.round((xpInLevel / xpForNext) * 100) : 100;
      return `
        <div class="learn-level-card">
          <span class="learn-cat-icon">${cat.icon}</span>
          <span class="learn-cat-name">${cat.name}</span>
          <span class="learn-cat-level">Lv.${p.level}</span>
          <div class="learn-xp-bar"><div class="learn-xp-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');

    // 3. 可用课程列表
    const courses = ls.getCourses();
    let coursesHtml = '';
    if (courses.length === 0) {
      coursesHtml = '<div class="skill-empty">暂无可学习的课程，点击下方按钮生成</div>';
    } else {
      coursesHtml = courses.map(c => {
        const stars = '\u2B50'.repeat(c.complexity);
        const frag = `${c.fragments || 0}/${c.totalFragments}`;
        const daysLeft = Math.ceil((c.expiresAt - Date.now()) / 86400000);
        const canStart = !activeLesson;
        return `
          <div class="learn-course-card ${canStart ? '' : 'learn-disabled'}">
            <div class="learn-course-header">
              <span class="learn-course-title">${this._escapeHtml(c.title)}</span>
              <span class="learn-course-cat">${this._escapeHtml(c.categoryName)}</span>
            </div>
            <div class="learn-course-desc">${this._escapeHtml(c.description || '')}</div>
            <div class="learn-course-meta">
              <span title="复杂度">${stars}</span>
              <span title="碎片进度">\uD83E\uDDE9 ${frag}</span>
              <span title="过期时间">\u23F3 ${daysLeft}天</span>
            </div>
            ${canStart ? `<button class="learn-start-btn" data-course-id="${c.id}">\u25B6 开始学习</button>` : ''}
          </div>
        `;
      }).join('');
    }

    // 4. 生成课程按钮
    const genBusy = this.courseGenerator?.isBusy;
    const genBtnHtml = `
      <div class="learn-gen-section">
        <select class="learn-gen-select">
          ${SKILL_CATEGORIES.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('')}
        </select>
        <button class="learn-gen-btn" ${genBusy ? 'disabled' : ''}>${genBusy ? '生成中...' : '\u2728 生成新课程'}</button>
      </div>
    `;

    // 5. 学习历史
    const history = ls.getHistory();
    let historyHtml = '';
    if (history.length > 0) {
      const recentHistory = history.slice(-5).reverse();
      historyHtml = `
        <div class="skill-section-title">\uD83C\uDF93 已毕业课程</div>
        <div class="learn-history-list">
          ${recentHistory.map(c => {
            const date = new Date(c.completedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
            return `<div class="learn-history-item"><span>${this._escapeHtml(c.title)}</span><span class="learn-history-date">${date}</span></div>`;
          }).join('')}
        </div>
      `;
    }

    body.innerHTML = `
      ${activeHtml}
      <div class="skill-section-title">\uD83C\uDFAF 学习等级</div>
      <div class="learn-level-grid">${levelCards}</div>
      <div class="skill-section-title">\uD83D\uDCDA 可学习课程</div>
      ${coursesHtml}
      ${genBtnHtml}
      ${historyHtml}
    `;

    // 事件绑定
    if (activeLesson) {
      body.querySelector('.learn-abort-btn')?.addEventListener('click', () => {
        this.learningSystem.abortLesson();
        this._loadAndRender();
      });
    }

    body.querySelectorAll('.learn-start-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const courseId = btn.dataset.courseId;
        if (this._onStartLesson) this._onStartLesson(courseId);
        this.close();
      });
    });

    body.querySelector('.learn-gen-btn')?.addEventListener('click', async () => {
      const select = body.querySelector('.learn-gen-select');
      const catName = select.value;
      const btn = body.querySelector('.learn-gen-btn');
      btn.disabled = true;
      btn.textContent = '生成中...';

      // 收集近期该类别的工具
      const unlockData = this.unlockSystem?.getData() || {};
      const cat = SKILL_CATEGORIES.find(c => c.name === catName);
      const recentTools = cat ? Object.keys(unlockData).filter(name =>
        cat.keys.some(k => name.toLowerCase().includes(k))
      ).slice(0, 10) : [];

      const result = await this.courseGenerator?.generate(catName, recentTools);
      if (result) {
        this.learningSystem.addCourse(result);
        await this._loadAndRender();
      } else {
        btn.textContent = '生成失败，请重试';
        btn.disabled = false;
      }
    });
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
    const stars = this.unlockSystem?.getStars(t.name) || 0;
    const locked = !!this.unlockSystem && stars === 0;
    const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
    const desc = t.description ? this._escapeHtml(t.description.slice(0, 60)) : '\u2014';
    const name = this._escapeHtml(t.name);
    const count = this.unlockSystem?.getData()[t.name]?.count || 0;
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
