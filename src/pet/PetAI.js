/**
 * PetAI.js
 * 宠物层 AI 服务 — 宠物自身的"内心活动"通道
 *
 * 不经过 OpenClaw gateway，由 main 进程直接调用 LLM API。
 * 用于领悟生成、反思等宠物私有的 AI 调用，结果不进聊天面板。
 */

const DEFAULT_PERSONA = '你是一只可爱的桌面宠物猫';

export class PetAI {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this._busy = false;
    this._persona = null; // 懒加载，首次调用时从配置读取
  }

  get isBusy() { return this._busy; }

  /** 获取用户配置的人设，缓存结果 */
  async _getPersona() {
    if (this._persona) return this._persona;
    try {
      const cfg = await this.electronAPI.getConfig?.();
      this._persona = cfg?.systemPrompt?.trim() || DEFAULT_PERSONA;
    } catch {
      this._persona = DEFAULT_PERSONA;
    }
    return this._persona;
  }

  /** 配置变更时重置缓存（由外部调用） */
  resetPersona() { this._persona = null; }

  /**
   * 生成领悟内容
   * @param {string} domainName  知识域名称（如"编程/技术"）
   * @param {string[]} recentTopics  最近对话关键词样本
   * @returns {Promise<{bubble,skillName,skillTitle,skillDesc,skillContent,summary}|null>}
   */
  /**
   * 生成学习事件的宠物反应气泡
   * @param {'start'|'complete'|'interrupt'} event
   * @param {string} courseTitle
   * @param {string} categoryName
   * @returns {Promise<string|null>} 气泡文本，15字内
   */
  async generateLearningReaction(event, courseTitle, categoryName) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const persona = await this._getPersona();
      const eventDesc = {
        start:     `刚刚开始学习「${courseTitle}」（${categoryName}领域），心情有点紧张又期待`,
        complete:  `刚刚完成了一节「${courseTitle}」的学习（${categoryName}领域），感觉学到了东西`,
        interrupt: `学习「${courseTitle}」被迫中断了，有点遗憾`,
      }[event] || '';

      const prompt = `${persona}。${eventDesc}。
用一句符合你人设口吻的话表达此刻的心情，10字以内，自然口语，末尾可加一个emoji，不要引号，直接输出文字。`;

      const text = await this.electronAPI.petAIComplete(prompt);
      return text?.trim().slice(0, 30) || null;
    } catch (e) {
      console.warn('[PetAI] generateLearningReaction failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }

  /**
   * 学习中碎碎念 — 8字内学习感想
   */
  async generateMurmur(courseTitle, categoryName, elapsed, duration) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const persona = await this._getPersona();
      const pct = Math.round((elapsed / duration) * 100);
      const phase = pct < 30 ? '刚开始学习' : pct < 70 ? '学到一半了' : '快学完了';

      const prompt = `${persona}。正在学习「${courseTitle}」（${categoryName}领域），${phase}（进度${pct}%）。
用符合你人设口吻嘟囔一句学习中的小感想，8字以内，自然口语，可加一个emoji，不要引号，直接输出。`;

      const text = await this.electronAPI.petAIComplete(prompt);
      return text?.trim().slice(0, 20) || null;
    } catch (e) {
      console.warn('[PetAI] generateMurmur failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }

  /**
   * 学习互动问答 — 返回 JSON {question, choices, reactions}
   */
  async generateQuizQuestion(courseTitle, categoryName, elapsed, duration) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const persona = await this._getPersona();
      const pct = Math.round((elapsed / duration) * 100);
      const prompt = `${persona}。正在学习「${courseTitle}」（${categoryName}领域），进度${pct}%。
生成一个关于学习状态的简单互动问题，问主人此刻的感受/状态（不要问课程内容）。回应要符合你的人设口吻。

返回严格JSON（无代码块标记）：
{"question":"问题文字，12字以内","choices":[{"text":"选项1，4字以内","mood":10,"intimacy":3},{"text":"选项2","mood":5,"intimacy":2},{"text":"选项3","mood":-5,"intimacy":2}],"reactions":{"0":"选项1的回应8字内","1":"选项2的回应","2":"选项3的回应"}}`;

      const text = await this.electronAPI.petAIComplete(prompt);
      if (!text) return null;
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]);
    } catch (e) {
      console.warn('[PetAI] generateQuizQuestion failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }

  /**
   * 学习小故事/冷知识 — 100-200字 markdown
   */
  async generateFunFact(courseTitle, categoryName) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const persona = await this._getPersona();
      const prompt = `${persona}。正在学习「${courseTitle}」（${categoryName}领域）。
分享一个与${categoryName}领域相关的有趣冷知识或小故事，用符合你人设的口吻。

要求：100-200字，可用markdown格式（加粗、列表等），有趣且轻松，末尾加一个可爱的总结。不要引号包裹。`;

      const text = await this.electronAPI.petAIComplete(prompt);
      return text?.trim() || null;
    } catch (e) {
      console.warn('[PetAI] generateFunFact failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }

  async generateEpiphany(domainName, recentTopics = []) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const persona = await this._getPersona();
      const topicHint = recentTopics.length
        ? `最近涉及的关键词：${recentTopics.slice(0, 8).join('、')}。`
        : '';

      const prompt = `${persona}的内心意识。你最近陪伴主人经历了许多关于「${domainName}」的事情。${topicHint}根据这些经历，生成一次真实的"领悟"事件。

请返回严格的 JSON（不要有代码块标记，不要有其他内容）：
{"bubble":"一句符合你人设口吻的感悟，15字内，自然口语，不含引号","skillName":"技能英文ID，kebab-case，如code-intuition","skillTitle":"技能中文名，4到8字","skillDesc":"触发描述，给AI agent看，说明何时用此技能，20到30字","skillContent":"技能内容，对AI agent的具体指导，100到200字","summary":"事件摘要，用于记忆系统，20字内"}`;

      const text = await this.electronAPI.petAIComplete(prompt);
      if (!text) return null;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { console.warn('[PetAI] No JSON in response:', text.slice(0, 100)); return null; }
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('[PetAI] generateEpiphany failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }
}
