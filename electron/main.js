/**
 * main.js — Electron 主进程
 *
 * 一体化打包架构：
 * - 透明无框窗口承载桌面宠物
 * - 内部管理 OpenClaw Gateway 生命周期（自动启动/关闭）
 * - 通过 WebSocket RPC 与 OpenClaw Gateway 全能力通信
 * - 用户只需启动一个 exe，一切自动搞定
 */

const { app, BrowserWindow, ipcMain, Menu, screen, clipboard } = require('electron');
const path = require('path');
const { LLMService, AI_PROVIDERS } = require('./llm-service');

let mainWindow = null;
let llmService = null;
let isExpanded = false;
let clipboardInterval = null;
let lastClipboardText = '';

// ===== 剪贴板内容类型检测 =====
function detectClipboardType(text) {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return 'url';
  if (/error|exception|traceback|at line \d|syntax error|undefined is not/i.test(t)) return 'error';
  if (/[\{\}]|import |function |class |=>|const |let |var |def |public |private |async |await |#include|SELECT |FROM /.test(t)) return 'code';
  if (t.length > 200) return 'longtext';
  return 'text';
}

// ===== 窗口尺寸 =====
const PET_SIZE = { width: 200, height: 250 };
const EXPANDED_SIZE = { width: 520, height: 520 };

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: PET_SIZE.width,
    height: PET_SIZE.height,
    x: screenWidth - PET_SIZE.width - 50,
    y: screenHeight - PET_SIZE.height - 20,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  // ===== IPC: 鼠标穿透 =====
  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // ===== IPC: 窗口拖拽 =====
  ipcMain.on('start-drag', () => {});

  ipcMain.on('move-window', (event, dx, dy) => {
    if (mainWindow) {
      const [wx, wy] = mainWindow.getPosition();
      mainWindow.setPosition(wx + dx, wy + dy);
    }
  });

  ipcMain.handle('get-window-position', () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      return { x, y };
    }
    return { x: 0, y: 0 };
  });

  ipcMain.handle('get-screen-size', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });

  // ===== IPC: 窗口展开/收缩 =====
  ipcMain.on('expand-window', (event, expand) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();

    if (expand && !isExpanded) {
      isExpanded = true;
      const newX = Math.max(0, x - (EXPANDED_SIZE.width - PET_SIZE.width));
      const newY = Math.max(0, y - (EXPANDED_SIZE.height - PET_SIZE.height));
      mainWindow.setBounds({ x: newX, y: newY, width: EXPANDED_SIZE.width, height: EXPANDED_SIZE.height });
    } else if (!expand && isExpanded) {
      isExpanded = false;
      const newX = x + (EXPANDED_SIZE.width - PET_SIZE.width);
      const newY = y + (EXPANDED_SIZE.height - PET_SIZE.height);
      mainWindow.setBounds({ x: newX, y: newY, width: PET_SIZE.width, height: PET_SIZE.height });
    }
  });

  // ===== IPC: LLM 对话（兼容旧接口） =====
  ipcMain.handle('chat-with-ai', async (event, message) => {
    return await llmService.chat(message);
  });

  // ===== IPC: 流式聊天 =====
  ipcMain.handle('chat-send', async (event, message, sessionKey) => {
    return await llmService.chatSend(message, sessionKey);
  });

  ipcMain.handle('chat-abort', async (event, sessionKey, runId) => {
    return await llmService.chatAbort(sessionKey, runId);
  });

  ipcMain.handle('chat-history', async (event, sessionKey, limit) => {
    return await llmService.chatHistory(sessionKey, limit);
  });

  // ===== IPC: 会话管理 =====
  ipcMain.handle('sessions-list', async () => {
    return await llmService.sessionsList();
  });

  ipcMain.handle('sessions-reset', async (event, sessionKey, reason) => {
    return await llmService.sessionsReset(sessionKey, reason);
  });

  // ===== IPC: 模型和工具 =====
  ipcMain.handle('models-list', async () => {
    return await llmService.modelsList();
  });

  ipcMain.handle('tools-catalog', async (event, agentId) => {
    return await llmService.toolsCatalog(agentId);
  });

  // ===== IPC: 配置 =====
  ipcMain.handle('get-config', () => {
    return llmService.getConfig();
  });

  ipcMain.handle('save-config', (event, newConfig) => {
    return llmService.saveConfig(newConfig);
  });

  ipcMain.handle('save-and-apply', async (event, newConfig) => {
    return await llmService.saveAndApply(newConfig);
  });

  ipcMain.handle('write-openclaw-config', (event, aiConfig) => {
    return llmService.writeOpenClawConfig(aiConfig);
  });

  ipcMain.handle('get-gateway-health', () => {
    return llmService.getGatewayHealth();
  });

  ipcMain.handle('get-ai-providers', () => {
    return AI_PROVIDERS;
  });

  ipcMain.handle('clear-chat-history', () => {
    llmService.clearHistory();
    return true;
  });

  // ===== IPC: 右键菜单 =====
  ipcMain.on('show-context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: '💬 打开聊天',
        click: () => mainWindow.webContents.send('toggle-chat')
      },
      {
        label: '⚙️ 设置',
        click: () => mainWindow.webContents.send('open-settings')
      },
      { type: 'separator' },
      {
        label: '🍤 喂零食',
        click: () => mainWindow.webContents.send('feed-pet')
      },
      {
        label: '📏 大小',
        submenu: [
          { label: '小 (80px)', click: () => mainWindow.webContents.send('resize-pet', 80) },
          { label: '中 (128px)', click: () => mainWindow.webContents.send('resize-pet', 128) },
          { label: '大 (180px)', click: () => mainWindow.webContents.send('resize-pet', 180) },
        ]
      },
      {
        label: '📌 置顶',
        type: 'checkbox',
        checked: mainWindow.isAlwaysOnTop(),
        click: (item) => mainWindow.setAlwaysOnTop(item.checked)
      },
      { type: 'separator' },
      {
        label: '🗑️ 清空对话',
        click: () => {
          llmService.clearHistory();
          mainWindow.webContents.send('chat-cleared');
        }
      },
      {
        label: '🔧 开发者工具',
        click: () => mainWindow.webContents.openDevTools({ mode: 'detach' })
      },
      { type: 'separator' },
      { label: '❌ 退出', click: () => app.quit() }
    ]);
    menu.popup({ window: mainWindow });
  });

  // 渲染进程日志转发
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = ['[renderer]', '[renderer:WARN]', '[renderer:ERR]'][level] || '[renderer]';
    console.log(`${prefix} ${message}`);
  });

  // 开发模式
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== 启动 =====
app.whenReady().then(async () => {
  llmService = new LLMService();
  await llmService.init();

  createWindow();

  // 注册流式聊天事件转发到渲染进程
  llmService.onChatEvent((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat-stream', payload);
    }
  });

  llmService.onAgentEvent((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-event', payload);
    }
  });

  // Gateway 就绪后通知渲染进程
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('gateway-status', {
        ready: llmService.gatewayReady,
        wsConnected: llmService.wsConnected,
      });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ===== 剪贴板监控 =====
  clipboardInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const text = clipboard.readText();
      if (text && text !== lastClipboardText && text.trim().length >= 10) {
        lastClipboardText = text;
        const type = detectClipboardType(text);
        mainWindow.webContents.send('clipboard-changed', {
          text: text.substring(0, 600),
          type,
        });
      }
    } catch {}
  }, 2000);
});

app.on('before-quit', () => {
  if (llmService) llmService.destroy();
  if (clipboardInterval) clearInterval(clipboardInterval);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
