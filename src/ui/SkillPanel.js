/**
 * SkillPanel.js
 * 技能面板 — 展示宠物解锁的技能和成长状态
 * 毛玻璃 · 暖橙主题
 */

const TABS = [
  { id: 'skills', label: '🐾 技能' },
  { id: 'growth', label: '📈 成长' },
  { id: 'about',  label: 'ℹ️ 关于' },
];

export class SkillPanel {
  constructor(electronAPI, intimacySystem) {
    this.electronAPI = electronAPI;
    this.intimacySystem = intimacySystem;
    this.isOpen = false;
    this.activeTab = 'skills';
    this.element = null;
    this._createDOM();
  }

  _createDOM() {
    this.element = document.createElement('div');
    this.element.id = 'skill-panel';
    this.element.innerHTML = `
      <div class="skill-header">
        <span>✨ 技能</span>
        <button class="skill-close">✕</button>
      </div>
      <div class="skill-tabs">
        ${TABS.map(t => `<button class="skill-tab${t.id === this.activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="skill-body"></div>
    `;

    this.bodyEl = this.element.querySelector('.skill-body');

    this.element.querySelector('.skill-close').addEventListener('click', () => this.close());

    this.element.querySelectorAll('.skill-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.element.querySelectorAll('.skill-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderTab();
      });
    });

    document.body.appendChild(this.element);
  }

  _renderTab() {
    this.bodyEl.innerHTML = '';
    if (this.activeTab === 'skills') this._renderSkills();
    else if (this.activeTab === 'growth') this._renderGrowth();
    else this._renderAbout();
  }

  _renderSkills() {
    const stage = this.intimacySystem?.stage ?? 0;

    const skills = [
      { name: '基础对话', desc: '与你自由交流，解答问题', stars: 3, minStage: 0 },
      { name: '文件分析', desc: '拖入代码/文档，智能解读', stars: 3, minStage: 0 },
      { name: '情感感知', desc: '识别你的情绪，给予安慰', stars: 2, minStage: 1 },
      { name: 'Markdown 渲染', desc: '格式化展示 AI 回复内容', stars: 2, minStage: 1 },
      { name: '深度记忆', desc: '记住你的偏好和历史', stars: 3, minStage: 2 },
      { name: '心灵感应', desc: '主动发现你可能需要什么', stars: 3, minStage: 3 },
    ];

    skills.forEach(skill => {
      const locked = stage < skill.minStage;
      const card = document.createElement('div');
      card.className = 'skill-card' + (locked ? ' skill-card-locked' : '');

      const starsHtml = Array.from({ length: 3 }, (_, i) =>
        `<span class="skill-star${i < skill.stars ? '' : ' empty'}">★</span>`
      ).join('');

      card.innerHTML = `
        <div class="skill-card-name">${locked ? '🔒 ' : ''}${skill.name}</div>
        <div class="skill-card-desc">${locked ? `亲密度达到阶段 ${skill.minStage} 后解锁` : skill.desc}</div>
        <div class="skill-stars">${starsHtml}</div>
      `;
      this.bodyEl.appendChild(card);
    });
  }

  _renderGrowth() {
    const sys = this.intimacySystem;
    if (!sys) {
      this.bodyEl.innerHTML = '<div class="skill-empty">成长数据不可用</div>';
      return;
    }

    const stages = [
      { name: '幼猫 🐱', threshold: 0 },
      { name: '朋友 😺', threshold: 100 },
      { name: '亲密伙伴 😻', threshold: 350 },
      { name: '心灵契合 💖', threshold: 800 },
    ];

    const currentPts = sys.points ?? 0;
    const currentStage = sys.stage ?? 0;
    const nextThreshold = stages[currentStage + 1]?.threshold;
    const progress = nextThreshold
      ? Math.min(100, Math.round(((currentPts - (stages[currentStage]?.threshold ?? 0)) / (nextThreshold - (stages[currentStage]?.threshold ?? 0))) * 100))
      : 100;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;color:#555;margin-bottom:4px;">当前阶段</div>
        <div style="font-size:18px;font-weight:700;color:#333;">${stages[currentStage]?.name ?? '未知'}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">亲密度：${currentPts} 点${nextThreshold ? ` / 下一阶段 ${nextThreshold} 点` : ' (已满级)'}</div>
      </div>
      <div style="background:rgba(0,0,0,0.06);border-radius:8px;height:8px;overflow:hidden;margin-bottom:16px;">
        <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#FF8C42,#FF6B35);border-radius:8px;transition:width 0.5s ease;"></div>
      </div>
    `;

    stages.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
      const reached = i <= currentStage;
      row.innerHTML = `
        <div style="width:20px;height:20px;border-radius:50%;background:${reached ? 'linear-gradient(135deg,#FF8C42,#FF6B35)' : 'rgba(0,0,0,0.1)'};display:flex;align-items:center;justify-content:center;font-size:10px;color:${reached ? 'white' : '#aaa'};flex-shrink:0;">${reached ? '✓' : i + 1}</div>
        <div>
          <div style="font-size:12px;font-weight:${i === currentStage ? '700' : '500'};color:${reached ? '#333' : '#aaa'};">${s.name}</div>
          <div style="font-size:10px;color:#aaa;">${s.threshold > 0 ? `${s.threshold} 点` : '起始阶段'}</div>
        </div>
      `;
      wrapper.appendChild(row);
    });

    this.bodyEl.appendChild(wrapper);
  }

  _renderAbout() {
    this.bodyEl.innerHTML = `
      <div style="text-align:center;padding:16px 8px;">
        <div style="font-size:32px;margin-bottom:8px;">🐾</div>
        <div style="font-size:15px;font-weight:700;color:#333;margin-bottom:4px;">OpenClaw Pet</div>
        <div style="font-size:11px;color:#888;margin-bottom:16px;">你的 AI 桌面助手伙伴</div>
        <div style="font-size:11px;color:#aaa;line-height:1.8;">
          双击宠物 → 打开聊天<br>
          右键宠物 → 更多选项<br>
          长按宠物 → 增加亲密度<br>
          拖入文件 → AI 分析
        </div>
      </div>
    `;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.element.classList.add('open');
    this._renderTab();

    if (this.electronAPI?.expandWindow) {
      this.electronAPI.expandWindow(true);
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove('open');

    if (this.electronAPI?.expandWindow) {
      this.electronAPI.expandWindow(false);
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  destroy() {
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
