/**
 * app.js — OpenClaw Pet 入口
 *
 * 单进程一体化架构：
 * - 宠物动画 + 交互
 * - 聊天面板（双击打开，直接和内嵌 LLM 对话）
 * - 设置面板（右键 → 设置）
 *
 * 没有外部服务依赖，所有 AI 调用通过 IPC → 主进程 LLM Service
 */

import { SpriteSheet } from './pet/SpriteSheet.js';
import { PetRenderer } from './pet/PetRenderer.js';
import { StateMachine } from './pet/StateMachine.js';
import { Behaviors } from './pet/Behaviors.js';
import { MoodSystem } from './pet/MoodSystem.js';
import { DragHandler } from './interaction/DragHandler.js';
import { ClickHandler } from './interaction/ClickHandler.js';
import { ContextMenu } from './interaction/ContextMenu.js';
import { Bubble } from './ui/Bubble.js';
import { ChatPanel } from './ui/ChatPanel.js';
import { SettingsPanel } from './ui/SettingsPanel.js';

class OpenClawPet {
  constructor() {
    this.canvas = document.getElementById('pet-canvas');
    this.bubbleContainer = document.getElementById('bubble-container');
    this.electronAPI = window.electronAPI || null;

    this.spriteSheet = new SpriteSheet();
    this.stateMachine = new StateMachine();
    this.moodSystem = new MoodSystem();
    this.renderer = null;
    this.behaviors = null;
    this.bubble = null;
    this.chatPanel = null;
    this.settingsPanel = null;

    this.dragHandler = null;
    this.clickHandler = null;
    this.contextMenu = null;

    this._lastTime = 0;
    this._running = false;
    this._proactiveTimer = null;
    this._pendingClipboard = null; // 待处理的剪贴板内容
  }

  async init() {
    console.log('🐱 OpenClaw Pet initializing...');

    // 1. 加载 spritesheet
    try {
      await this.spriteSheet.load(
        '../assets/sprites/placeholder/spritesheet.png',
        '../assets/sprites/placeholder/spritesheet.json'
      );
      console.log('✅ Spritesheet loaded');
    } catch (e) {
      console.error('❌ Failed to load spritesheet:', e);
      this._showFallback();
      return;
    }

    // 2. 初始化渲染器
    this.renderer = new PetRenderer(this.canvas, this.spriteSheet, 128);

    // 3. 获取屏幕尺寸
    let screenWidth = 800;
    if (this.electronAPI) {
      try {
        const size = await this.electronAPI.getScreenSize();
        screenWidth = size.width;
      } catch (e) {}
    }

    // 4. 行为系统
    this.behaviors = new Behaviors(this.stateMachine, this.renderer, {
      screenWidth,
      walkSpeed: 1.5,
      minIdleTime: 4000,
      maxIdleTime: 12000,
    });

    // 5. UI 组件
    this.bubble = new Bubble(this.bubbleContainer);
    this.chatPanel = new ChatPanel(this.electronAPI, this.stateMachine, this.bubble);
    this.settingsPanel = new SettingsPanel(this.electronAPI);

    // 6. 交互处理器
    this.dragHandler = new DragHandler(
      this.canvas, this.stateMachine, this.behaviors, this.electronAPI
    );

    this.clickHandler = new ClickHandler(
      this.canvas, this.stateMachine, this.behaviors, {
        onSingleClick: () => {
          this.moodSystem.gain(3);
          const level = this.moodSystem.getLevel();
          const greets = level === 'sad'
            ? ['...喵', '(T_T)', '嗯...', '理我一下嘛']
            : ['喵~ ❤️', '嗯？', '摸摸~', '(=^・ω・^=)', '在呢~'];
          this.bubble.show(greets[Math.floor(Math.random() * greets.length)], 2000);
        },
        onDoubleClick: () => {
          if (this.settingsPanel.isOpen) this.settingsPanel.close();
          this.chatPanel.toggle();
        },
        onLongPress: () => {
          // 摸头！
          this.moodSystem.gain(15);
          this.behaviors.recordInteraction();
          const purrs = ['咕噜噜~ 😻', '好舒服喵~', '再摸摸！(=^ω^=)', '呼噜呼噜...', '主人真好~ ❤️', '喵呜~'];
          this.bubble.show(purrs[Math.floor(Math.random() * purrs.length)], 3000);
          this.stateMachine.transition('happy', { force: true, duration: 2000 });
        }
      }
    );

    if (this.electronAPI) {
      this.contextMenu = new ContextMenu(
        this.canvas, this.electronAPI, this.behaviors
      );
    }

    // 7. 鼠标穿透
    this._setupMousePassthrough();

    // 8. 心情值变化响应
    this.moodSystem.onChange((level, mood) => {
      if (level === 'sad') {
        this.bubble.show('主人...你不陪我吗 🥺', 4000);
        this.stateMachine.transition('sad', { force: true, duration: 2000 });
      } else if (level === 'joyful') {
        this.bubble.show('今天好开心！❤️', 2500);
        this.stateMachine.transition('happy', { force: true, duration: 1500 });
      }
    });

    // 9. 监听主进程事件
    this._setupMainProcessEvents();

    // 10. 启动
    this.renderer.start();
    this.behaviors.start();
    this._startMainLoop();
    this._startProactiveTimer();

    // 开场问候（根据时间 + 上次登录）
    setTimeout(async () => {
      const greeting = this._buildGreeting();
      this.bubble.show(greeting, 4000);
      this.stateMachine.transition('happy', { force: true, duration: 1200 });
    }, 800);

    console.log('✅ OpenClaw Pet ready!');
  }

  /**
   * 根据时间和上次登录时间生成开场问候语
   */
  _buildGreeting() {
    const now = Date.now();
    const lastLaunch = parseInt(localStorage.getItem('pet-last-launch') || '0');
    const hoursSince = (now - lastLaunch) / 3600000;
    localStorage.setItem('pet-last-launch', String(now));

    if (lastLaunch > 0 && hoursSince > 12) {
      return `好久不见喵！等你 ${Math.round(hoursSince)} 小时了 🥺`;
    }

    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9)  return '早上好主人！今天也加油哦~ ☀️';
    if (hour >= 9 && hour < 12) return '上午好~ 有什么需要帮忙的吗？😊';
    if (hour >= 12 && hour < 14) return '午饭吃了吗主人~ 记得休息！🍱';
    if (hour >= 14 && hour < 18) return '下午好~ 专注工作中？我陪着你喵~';
    if (hour >= 18 && hour < 21) return '晚上好！辛苦了一天~ 🌙';
    if (hour >= 21 && hour < 24) return '好晚了喵... 别忘了休息哦 💤';
    return '深夜了... 主人要注意身体喵 🌛';
  }

  /**
   * 每 5 分钟检查：长时间无互动时主动打招呼
   */
  _startProactiveTimer() {
    this._proactiveTimer = setInterval(() => {
      if (!this._running) return;
      const idleMs = Date.now() - (this.behaviors.lastInteractionTime || Date.now());
      if (idleMs < 10 * 60 * 1000) return;        // 不足 10 分钟不触发
      if (this.bubble.isVisible()) return;          // 气泡正显示时不打扰
      if (this.chatPanel.isOpen) return;            // 聊天中不触发

      const msgs = [
        '主人~ 还在吗？(=TωT=)',
        '喂喂！不理我吗 🥺',
        '好无聊喵... 陪我玩玩嘛~',
        '你已经很久没搭理我了喵！',
        '(屁股蹭蹭) 注意到我了吗~',
      ];
      this.bubble.show(msgs[Math.floor(Math.random() * msgs.length)], 5000);
      this.stateMachine.transition('sad', { force: true, duration: 2000 });
    }, 5 * 60 * 1000);
  }

  _setupMousePassthrough() {
    if (!this.electronAPI) return;

    // 全局 mousemove：根据鼠标位置决定是否穿透
    // 面板区域 → 不穿透；canvas 非透明像素 → 不穿透；其他 → 穿透
    document.addEventListener('mousemove', (e) => {
      // 1. 鼠标在打开的面板上 → 不穿透
      const chatPanel = document.getElementById('chat-panel');
      const settingsPanel = document.getElementById('settings-panel');
      const isOverPanel =
        (chatPanel?.classList.contains('open') && chatPanel.contains(e.target)) ||
        (settingsPanel?.classList.contains('open') && settingsPanel.contains(e.target));

      if (isOverPanel) {
        this.electronAPI.setIgnoreMouse(false);
        return;
      }

      // 2. 鼠标在 canvas 上 → 检查像素透明度
      if (e.target === this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        if (x >= 0 && y >= 0 && x < this.canvas.width && y < this.canvas.height) {
          const ctx = this.canvas.getContext('2d');
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          this.electronAPI.setIgnoreMouse(pixel[3] < 10);
        }
        return;
      }

      // 3. 其他区域（透明背景）→ 穿透
      this.electronAPI.setIgnoreMouse(true);
    });
  }

  _setupMainProcessEvents() {
    if (!this.electronAPI) return;

    // 右键菜单 → 打开聊天
    this.electronAPI.onToggleChat(() => {
      if (this.settingsPanel.isOpen) this.settingsPanel.close();
      this.chatPanel.toggle();
    });

    // 右键菜单 → 打开设置
    this.electronAPI.onOpenSettings(() => {
      if (this.chatPanel.isOpen) this.chatPanel.close();
      this.settingsPanel.open();
    });

    // 右键菜单 → 调整大小
    this.electronAPI.onResizePet((size) => {
      this.canvas.width = size;
      this.canvas.height = size;
      this.renderer.renderSize = size;
    });

    // 对话被清空
    this.electronAPI.onChatCleared(() => {
      this.bubble.show('对话已清空~ 重新开始吧！', 2000);
    });

    // 喂零食
    this.electronAPI.onFeedPet?.(() => {
      this.moodSystem.gain(20);
      this.behaviors.recordInteraction();
      const foods = ['好吃！~ 😋', '喵呜~ 谢谢主人！', '啊好香！还有吗！', '(=^・ω・^=) 满足了~', '最喜欢主人了！❤️'];
      this.bubble.show(foods[Math.floor(Math.random() * foods.length)], 3000);
      this.stateMachine.transition('happy', { force: true, duration: 1500 });
    });

    // 剪贴板感知
    this.electronAPI.onClipboardChange?.((data) => {
      if (this.chatPanel.isOpen || this.bubble.isVisible()) return;
      const hints = {
        code:     '检测到代码~ 需要帮忙看看吗？🐾',
        error:    '好像是报错！我来帮你分析！😼',
        url:      '发现了一个链接 👀 要我帮你看看吗？',
        longtext: '复制了一大段文字，需要我帮你处理吗？',
      };
      const hint = hints[data.type];
      if (!hint) return;
      this._pendingClipboard = data.text;
      this.bubble.show(hint, 6000);
      this.stateMachine.transition('idle2', { force: true, duration: 2000 }); // 侧耳倾听
    });
  }

  _startMainLoop() {
    this._running = true;
    this._lastTime = performance.now();

    const loop = (timestamp) => {
      if (!this._running) return;

      const deltaMs = timestamp - this._lastTime;
      this._lastTime = timestamp;

      this.stateMachine.update(deltaMs);
      this.behaviors.update(deltaMs);
      this.moodSystem.update(deltaMs);

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  _showFallback() {
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#FFB464';
    ctx.fillRect(30, 30, 68, 68);
    ctx.fillStyle = '#333';
    ctx.font = '40px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐱', 64, 75);
  }

  destroy() {
    this._running = false;
    if (this._proactiveTimer) clearInterval(this._proactiveTimer);
    this.renderer?.destroy();
    this.behaviors?.destroy();
    this.stateMachine?.destroy();
    this.dragHandler?.destroy();
    this.clickHandler?.destroy();
    this.contextMenu?.destroy();
    this.bubble?.destroy();
    this.chatPanel?.destroy();
    this.settingsPanel?.destroy();
  }
}

// 启动
const pet = new OpenClawPet();
pet.init().catch(e => console.error('Failed to initialize:', e));
window._pet = pet;
