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
          const greets = ['喵~ ❤️', '嗯？', '摸摸~', '(=^・ω・^=)', '在呢~'];
          this.bubble.show(greets[Math.floor(Math.random() * greets.length)], 2000);
        },
        onDoubleClick: () => {
          // 双击打开/关闭聊天面板
          if (this.settingsPanel.isOpen) {
            this.settingsPanel.close();
          }
          this.chatPanel.toggle();
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

    // 8. 监听主进程事件
    this._setupMainProcessEvents();

    // 9. 启动
    this.renderer.start();
    this.behaviors.start();
    this._startMainLoop();

    // 开场
    setTimeout(async () => {
      if (this.electronAPI) {
        try {
          const config = await this.electronAPI.getConfig();
          if (config.gatewayReady) {
            this.bubble.show('你好呀主人~ 双击我聊天喵！🐱', 3000);
            this.stateMachine.transition('happy', { force: true, duration: 1200 });
          } else {
            this.bubble.show('OpenClaw Gateway 连接中... 稍等喵~', 4000);
          }
        } catch {
          this.bubble.show('你好呀~ 我是 OpenClaw! 🐱', 3000);
        }
      }
    }, 800);

    console.log('✅ OpenClaw Pet ready!');
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
