/**
 * KnowledgeSystem.js
 * 知识积累 + 领悟触发系统
 *
 * 通过工具调用信号（而非关键词匹配）累积各技能分类的经验值。
 * 当某分类积累达到阈值 → 触发领悟事件（onEpiphany 回调）
 *
 * 冷却规则：
 *   - 首次领悟阈值：5 次工具调用
 *   - 后续：每次 +10
 *   - 全局冷却：上次领悟后 24 小时内不再触发
 */

// 领悟冒泡模板（可扩展，{{insight}} 为 AI 生成内容）
export const EPIPHANY_TEMPLATES = [
  '{{insight}}',
  '（发呆了一会儿）{{insight}}',
  '嗯... {{insight}}',
  '（眯起眼睛）{{insight}}',
];

export class KnowledgeSystem {
  constructor() {
    const saved = JSON.parse(localStorage.getItem('pet-knowledge') || 'null');
    this._data = saved || { domains: {}, lastEpiphanyAt: 0 };
    this._callbacks = [];
    this._triggering = false;

    console.log('[knowledge] Restored:', JSON.stringify(
      Object.fromEntries(Object.entries(this._data.domains).map(([k, v]) => [k, v.count]))
    ));
  }

  /**
   * 记录一次工具调用，归入对应技能分类
   * @param {string} domainName  技能分类名（来自 SKILL_CATEGORIES，如 '代码编写'）
   * @param {string} toolName    实际工具名，记录为 recentTopics 供 PetAI 参考
   */
  addToolUse(domainName, toolName) {
    if (!domainName) return;

    if (!this._data.domains[domainName]) {
      this._data.domains[domainName] = { count: 0, nextThreshold: 5, recentTopics: [] };
    }
    const d = this._data.domains[domainName];
    d.count++;
    if (toolName && !d.recentTopics.includes(toolName)) d.recentTopics.push(toolName);
    if (d.recentTopics.length > 12) d.recentTopics = d.recentTopics.slice(-12);

    this._save();
    this._checkEpiphany();
  }

  _checkEpiphany() {
    if (this._triggering) return;
    // 24h 全局冷却
    if (Date.now() - this._data.lastEpiphanyAt < 24 * 3600 * 1000) return;

    // 找出超过阈值的域（按超出量排序取最多的）
    const ready = Object.entries(this._data.domains)
      .filter(([, d]) => d.count >= d.nextThreshold)
      .sort((a, b) => (b[1].count - b[1].nextThreshold) - (a[1].count - a[1].nextThreshold));

    if (ready.length === 0) return;

    const [domainName, domainData] = ready[0];
    this._triggerEpiphany(domainName, domainData);
  }

  _triggerEpiphany(domainName, domainData) {
    this._triggering = true;
    this._data.domains[domainName].nextThreshold = domainData.count + 10;
    this._data.lastEpiphanyAt = Date.now();
    this._save();

    const recentTopics = [...domainData.recentTopics];
    this._callbacks.forEach(cb => cb({ domainName, recentTopics }));
    this._triggering = false;
  }

  /** 注册领悟触发回调 */
  onEpiphany(callback) {
    this._callbacks.push(callback);
  }

  /** 从模板渲染冒泡文字 */
  static renderBubble(insight, template = null) {
    const tpl = template || EPIPHANY_TEMPLATES[Math.floor(Math.random() * EPIPHANY_TEMPLATES.length)];
    return tpl.replace('{{insight}}', insight);
  }

  getData() { return this._data; }

  _save() {
    localStorage.setItem('pet-knowledge', JSON.stringify(this._data));
  }
}
