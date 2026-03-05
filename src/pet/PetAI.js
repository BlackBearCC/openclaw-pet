/**
 * PetAI.js
 * 宠物层 AI 服务 — 宠物自身的"内心活动"通道
 *
 * 不经过 OpenClaw gateway，由 main 进程直接调用 LLM API。
 * 用于领悟生成、反思等宠物私有的 AI 调用，结果不进聊天面板。
 */

export class PetAI {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this._busy = false;
  }

  get isBusy() { return this._busy; }

  /**
   * 生成领悟内容
   * @param {string} domainName  知识域名称（如"编程/技术"）
   * @param {string[]} recentTopics  最近对话关键词样本
   * @returns {Promise<{bubble,skillName,skillTitle,skillDesc,skillContent,summary}|null>}
   */
  async generateEpiphany(domainName, recentTopics = []) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const topicHint = recentTopics.length
        ? `最近涉及的关键词：${recentTopics.slice(0, 8).join('、')}。`
        : '';

      const prompt = `你是一只桌面宠物猫的内心意识。你最近陪伴主人经历了许多关于「${domainName}」的事情。${topicHint}根据这些经历，生成一次真实的"领悟"事件。

请返回严格的 JSON（不要有代码块标记，不要有其他内容）：
{"bubble":"一句符合猫咪口吻的感悟，15字内，自然口语，不含引号","skillName":"技能英文ID，kebab-case，如code-intuition","skillTitle":"技能中文名，4到8字","skillDesc":"触发描述，给AI agent看，说明何时用此技能，20到30字","skillContent":"技能内容，对AI agent的具体指导，100到200字","summary":"事件摘要，用于记忆系统，20字内"}`;

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
