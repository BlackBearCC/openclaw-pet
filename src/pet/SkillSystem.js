/**
 * SkillSystem.js
 * 统一技能系统 — 工具熟练度 + 知识领域积累 + 领悟触发
 *
 * 合并了原 SkillUnlockSystem（per-tool 星级）和 KnowledgeSystem（per-domain 领悟）
 *
 * 工具熟练度星级阈值: ★☆☆(1次) / ★★☆(5次) / ★★★(20次)
 * 领悟阈值: 首次5次工具调用，后续每次+10，全局24h冷却
 */

export const EPIPHANY_TEMPLATES = [
  '{{insight}}',
  '（发呆了一会儿）{{insight}}',
  '嗯... {{insight}}',
  '（眯起眼睛）{{insight}}',
];

const STAR_THRESHOLDS = [1, 5, 20];

export class SkillSystem {
  constructor() {
    // per-tool 熟练度
    this._tools = JSON.parse(localStorage.getItem('skill-tools') || 'null')
      || JSON.parse(localStorage.getItem('skill-unlocks') || '{}'); // 兼容旧 key

    // per-domain 领悟积累
    const savedDomains = JSON.parse(localStorage.getItem('skill-domains') || 'null')
      || JSON.parse(localStorage.getItem('pet-knowledge') || 'null');
    this._domains = savedDomains?.domains || savedDomains || {};
    this._lastEpiphanyAt = savedDomains?.lastEpiphanyAt || 0;

    // 已领悟技能列表
    this._realized = JSON.parse(localStorage.getItem('pet-realized-skills') || '[]');

    this._unlockCallbacks = [];
    this._epiphanyCallbacks = [];
    this._triggering = false;
  }

  /**
   * 记录一次工具调用
   * @param {string} toolName    工具名
   * @param {string} [domainName]  所属技能分类名（由 app.js 通过 SKILL_CATEGORIES 查找传入）
   */
  recordTool(toolName, domainName = null) {
    if (!toolName) return;

    // 1. per-tool 熟练度
    const entry = this._tools[toolName] || { count: 0, firstUsed: Date.now(), stars: 0 };
    entry.count++;
    const newStars = STAR_THRESHOLDS.reduce((s, t, i) => entry.count >= t ? i + 1 : s, 0);
    const upgraded = newStars > entry.stars;
    const isNew = entry.stars === 0 && newStars >= 1;
    entry.stars = newStars;
    this._tools[toolName] = entry;

    if (upgraded) {
      for (const cb of this._unlockCallbacks) cb({ toolName, stars: newStars, isNew });
    }

    // 2. per-domain 领悟积累
    if (domainName) {
      if (!this._domains[domainName]) {
        this._domains[domainName] = { count: 0, nextThreshold: 5, recentTools: [] };
      }
      const d = this._domains[domainName];
      d.count++;
      if (!d.recentTools.includes(toolName)) d.recentTools.push(toolName);
      if (d.recentTools.length > 12) d.recentTools = d.recentTools.slice(-12);
      this._checkEpiphany();
    }

    this._save();
  }

  /** 存入一条领悟技能（由 app.js 在 PetAI 生成后调用） */
  addRealized(skillData) {
    this._realized.push(skillData);
    localStorage.setItem('pet-realized-skills', JSON.stringify(this._realized));
  }

  _checkEpiphany() {
    if (this._triggering) return;
    if (Date.now() - this._lastEpiphanyAt < 24 * 3600 * 1000) return;

    const ready = Object.entries(this._domains)
      .filter(([, d]) => d.count >= d.nextThreshold)
      .sort((a, b) => (b[1].count - b[1].nextThreshold) - (a[1].count - a[1].nextThreshold));

    if (ready.length === 0) return;
    const [domainName, domainData] = ready[0];
    this._triggerEpiphany(domainName, domainData);
  }

  _triggerEpiphany(domainName, domainData) {
    this._triggering = true;
    this._domains[domainName].nextThreshold = domainData.count + 10;
    this._lastEpiphanyAt = Date.now();
    this._save();

    const recentTopics = [...domainData.recentTools];
    for (const cb of this._epiphanyCallbacks) cb({ domainName, recentTopics });
    this._triggering = false;
  }

  /** 工具升星/解锁回调 */
  onUnlock(callback) { this._unlockCallbacks.push(callback); }

  /** 领悟触发回调 */
  onEpiphany(callback) { this._epiphanyCallbacks.push(callback); }

  /** 从模板渲染冒泡文字 */
  static renderBubble(insight, template = null) {
    const tpl = template || EPIPHANY_TEMPLATES[Math.floor(Math.random() * EPIPHANY_TEMPLATES.length)];
    return tpl.replace('{{insight}}', insight);
  }

  // ===== Getters for UI =====
  getToolData() { return this._tools; }
  getToolStars(name) { return this._tools[name]?.stars || 0; }
  isToolUnlocked(name) { return (this._tools[name]?.stars || 0) >= 1; }
  getRealizedSkills() { return this._realized; }

  _save() {
    localStorage.setItem('skill-tools', JSON.stringify(this._tools));
    localStorage.setItem('skill-domains', JSON.stringify({
      domains: this._domains,
      lastEpiphanyAt: this._lastEpiphanyAt,
    }));
  }
}
