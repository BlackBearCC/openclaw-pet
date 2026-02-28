/**
 * SkillUnlockSystem.js
 * 技能解锁成就系统 — 追踪工具使用次数，升星解锁，亲密度联动
 *
 * localStorage: 'skill-unlocks' → { toolName: { count, firstUsed, stars } }
 * 星级阈值: ★☆☆ (1次首用) / ★★☆ (5次) / ★★★ (20次)
 */

const STAR_THRESHOLDS = [1, 5, 20];

export class SkillUnlockSystem {
  constructor() {
    this._data = this._load();
    this._callbacks = [];
  }

  /**
   * 记录一次工具使用，如有解锁/升星则触发回调
   * @param {string} toolName
   * @returns {{ toolName, stars, isNew } | null}
   */
  record(toolName) {
    if (!toolName) return null;
    const entry = this._data[toolName] || { count: 0, firstUsed: Date.now(), stars: 0 };
    entry.count++;
    const newStars = STAR_THRESHOLDS.reduce((s, t, i) => entry.count >= t ? i + 1 : s, 0);
    const upgraded = newStars > entry.stars;
    const isNew = entry.stars === 0 && newStars >= 1;
    entry.stars = newStars;
    this._data[toolName] = entry;
    this._save();
    if (upgraded) {
      const result = { toolName, stars: newStars, isNew };
      for (const cb of this._callbacks) cb(result);
      return result;
    }
    return null;
  }

  onUnlock(cb) { this._callbacks.push(cb); }
  getData() { return this._data; }
  isUnlocked(name) { return (this._data[name]?.stars || 0) >= 1; }
  getStars(name) { return this._data[name]?.stars || 0; }

  _load() {
    try { return JSON.parse(localStorage.getItem('skill-unlocks') || '{}'); }
    catch { return {}; }
  }
  _save() { localStorage.setItem('skill-unlocks', JSON.stringify(this._data)); }
}
