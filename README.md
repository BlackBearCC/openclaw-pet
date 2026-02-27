# OpenClaw Pet 🐱

OpenClaw 桌面宠物助手 — 内嵌 OpenClaw AI 的可爱像素小猫。

**一体化打包**：一个 exe 启动，OpenClaw Gateway 自动在内部运行，无需手动启动任何服务。

## 快速开始

```bash
# 安装全部依赖（含 OpenClaw）
npm install

# 生成占位帧动画（首次运行）
npm run generate-placeholder

# 启动（自动拉起 OpenClaw Gateway）
npm start

# 开发模式（自动打开 DevTools）
npm run dev

# 打包成 exe
npm run dist
```

**前提**：需要先通过 `openclaw onboard` 完成 OpenClaw 的基础配置（选模型、配 API Key 等），这些配置保存在 `~/.openclaw/openclaw.json` 中。

## 架构

```
┌─────────────────────────────────────┐
│           Electron 主进程            │
│  ┌─────────────────────────────┐    │
│  │     LLM Service             │    │
│  │  - 管理 Gateway 生命周期     │    │
│  │  - 调用 /v1/chat/completions│    │
│  └─────────┬───────────────────┘    │
│            │ HTTP localhost:18789    │
│  ┌─────────▼───────────────────┐    │
│  │  OpenClaw Gateway (子进程)   │    │
│  │  - 来自 node_modules/openclaw│   │
│  │  - 自动启动/关闭             │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│         Electron 渲染进程            │
│  - 帧动画引擎 (Canvas 2D)          │
│  - 状态机 + 自主行为                │
│  - 聊天面板 + 设置面板              │
│  - 拖拽 / 点击 / 右键菜单          │
└─────────────────────────────────────┘
```

## 功能

- **帧动画引擎** — Canvas 2D 渲染，spritesheet 驱动
- **动画状态机** — idle/walk/sit/sleep/drag/click_react/happy/sad/talk
- **自主行为** — 随机走动、坐下、打盹，无互动久了会睡觉
- **拖拽** — 抓住小猫拖到桌面任意位置
- **点击互动** — 单击摸头，双击打开聊天面板
- **消息气泡** — 头顶冒泡显示 AI 回复
- **内嵌 OpenClaw** — 自动管理 Gateway 生命周期，通过 HTTP API 对话
- **设置面板** — 右键 → 设置，配置 Agent ID、Token、宠物人设

## 项目结构

```
openclaw-pet/
├── electron/
│   ├── main.js          主进程、窗口、IPC
│   ├── preload.js       安全桥接 API
│   └── llm-service.js   OpenClaw Gateway 管理 + 对话
├── src/
│   ├── app.js           渲染入口
│   ├── pet/             帧动画引擎、状态机、行为
│   ├── interaction/     拖拽、点击、右键菜单
│   └── ui/              聊天面板、设置面板、气泡
├── assets/sprites/      帧动画资源
└── scripts/             工具脚本
```

## 替换动画资源

1. 准备 128x128 的序列帧 PNG
2. 打包成 spritesheet（如 TexturePacker）
3. 生成 JSON 元数据（参考 `assets/sprites/placeholder/spritesheet.json`）
4. 放到 `assets/sprites/cat/` 目录
