/**
 * CourseGenerator.js
 * 课程生成器 — 根据近期活动调用 LLM 生成学习课程
 *
 * 分析该类别下最近的工具使用记录，生成课程标题、描述、复杂度。
 * 依赖 PetAI 的 electronAPI.petAIComplete 通道。
 */

export class CourseGenerator {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this._busy = false;
  }

  get isBusy() { return this._busy; }

  /**
   * 根据该技能类别的近期活动生成一门课程
   * @param {string} categoryName — 技能类别名称（如"代码编写"）
   * @param {string[]} recentTools — 近期使用过的工具名列表
   * @returns {Promise<{title, description, complexity, skillContent}|null>}
   */
  async generate(categoryName, recentTools = []) {
    if (this._busy) return null;
    if (!this.electronAPI?.petAIComplete) return null;

    this._busy = true;
    try {
      const toolHint = recentTools.length
        ? `最近使用过的相关工具：${recentTools.slice(0, 10).join('、')}。`
        : '暂无近期工具使用记录，请根据该领域常见技能生成一门基础课程。';

      const prompt = `你是一只桌面宠物猫的学习顾问。主人最近在「${categoryName}」领域有一些活动。
${toolHint}
请设计一门适合猫咪学习的课程。课程标题应该来源于实际的工作活动（如果有的话），贴近真实使用场景。

请返回严格的 JSON（不要有代码块标记，不要有其他内容）：
{"title":"课程名称，3到8字，如：编写单元测试","description":"课程简介，20到40字","complexity":数字1到5表示需要几节课学完,"skillContent":"学完后作为技能的具体指导内容，100到200字"}`;

      const text = await this.electronAPI.petAIComplete(prompt);
      if (!text) return null;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[CourseGenerator] No JSON in response:', text.slice(0, 100));
        return null;
      }

      const result = JSON.parse(jsonMatch[0]);

      // 校验必填字段
      if (!result.title || !result.complexity) {
        console.warn('[CourseGenerator] Missing fields:', result);
        return null;
      }
      result.complexity = Math.max(1, Math.min(5, Math.round(result.complexity)));
      result.categoryName = categoryName;

      return result;
    } catch (e) {
      console.warn('[CourseGenerator] generate failed:', e.message);
      return null;
    } finally {
      this._busy = false;
    }
  }
}
