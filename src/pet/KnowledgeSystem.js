/**
 * KnowledgeSystem.js
 * 知识积累 + 领悟触发系统
 *
 * 每次 AI 对话完成时分析关键词 → 归类到知识域
 * 当某知识域积累达到阈值 → 触发领悟事件（onEpiphany 回调）
 *
 * 冷却规则：
 *   - 首次领悟阈值：5 条对话碎片
 *   - 后续：每次 +10 条
 *   - 全局冷却：上次领悟后 24 小时内不再触发
 */

const DOMAINS = {
  code: {
    name: '编程/技术',
    keywords: ['代码', '函数', 'bug', 'error', '调试', '算法', 'class', 'import', 'async',
               '组件', 'api', '接口', '数据库', 'git', 'npm', 'python', 'javascript',
               'typescript', '编译', '部署', 'react', 'vue', 'node', '请求', '响应', '报错'],
  },
  creative: {
    name: '创作/设计',
    keywords: ['设计', '排版', '配色', '字体', 'ui', '插画', '写作', '文案', '风格', '创意',
               '美观', '视觉', 'logo', '海报', '动画', '原型', '交互', '用户体验', '图片'],
  },
  science: {
    name: '科学/自然',
    keywords: ['物理', '数学', '化学', '生物', '宇宙', '数据', '统计', '公式', '实验',
               '研究', '论文', '科学', '模型', '分析', '机器学习', '神经网络', '推导'],
  },
  humanities: {
    name: '人文/哲学',
    keywords: ['历史', '哲学', '文化', '文学', '心理', '社会', '经济', '政治', '艺术',
               '音乐', '电影', '故事', '意义', '价值', '思考', '记忆', '情感', '语言'],
  },
  daily: {
    name: '日常/情感',
    keywords: ['今天', '感觉', '心情', '朋友', '家人', '生活', '工作', '休息', '吃饭',
               '睡觉', '开心', '难过', '压力', '累', '放松', '周末', '假期', '计划'],
  },
};

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
    this._data = saved || this._initData();
    this._callbacks = [];
    this._triggering = false;

    console.log('[knowledge] Restored:', JSON.stringify(
      Object.fromEntries(Object.entries(this._data.domains).map(([k, v]) => [k, v.count]))
    ));
  }

  _initData() {
    const domains = {};
    for (const key of Object.keys(DOMAINS)) {
      domains[key] = { count: 0, nextThreshold: 5, recentTopics: [] };
    }
    return { domains, lastEpiphanyAt: 0 };
  }

  /**
   * 分析一段对话文本，累加知识域碎片
   * @param {string} text  对话内容
   */
  addFragment(text) {
    const lower = text.toLowerCase();
    let updated = false;

    for (const [key, domain] of Object.entries(DOMAINS)) {
      const hits = domain.keywords.filter(kw => lower.includes(kw));
      if (hits.length === 0) continue;

      const d = this._data.domains[key];
      d.count++;
      for (const kw of hits) {
        if (!d.recentTopics.includes(kw)) d.recentTopics.push(kw);
      }
      if (d.recentTopics.length > 12) d.recentTopics = d.recentTopics.slice(-12);
      updated = true;
    }

    if (updated) {
      this._save();
      this._checkEpiphany();
    }
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

    const [domainKey, domainData] = ready[0];
    this._triggerEpiphany(domainKey, domainData);
  }

  _triggerEpiphany(domainKey, domainData) {
    this._triggering = true;
    // 立即更新阈值和冷却，防止重复触发
    this._data.domains[domainKey].nextThreshold = domainData.count + 10;
    this._data.lastEpiphanyAt = Date.now();
    this._save();

    const domainName = DOMAINS[domainKey].name;
    const recentTopics = [...domainData.recentTopics];

    this._callbacks.forEach(cb => cb({ domainKey, domainName, recentTopics }));
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
  getDomains() { return DOMAINS; }

  _save() {
    localStorage.setItem('pet-knowledge', JSON.stringify(this._data));
  }
}
