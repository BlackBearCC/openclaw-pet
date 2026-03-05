# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies (includes openclaw gateway)
npm run generate-placeholder   # Generate placeholder spritesheets (required first-time setup)
npm start                      # Launch app (auto-starts OpenClaw Gateway subprocess)
npm run dev                    # Development mode with DevTools opened
npm run dist                   # Build distributable Windows .exe
npm test                       # Run Jest tests (ES module support enabled)
```

**Prerequisite**: User must have run `openclaw onboard` once to create `~/.openclaw/openclaw.json` with API keys/model config.

**启动注意**：Claude Code 进程会设置 `ELECTRON_RUN_AS_NODE=1`，导致 `npm start` 在 Claude Code 终端里运行时 Electron 以纯 Node 模式启动（`require('electron')` 返回 undefined，app 报错）。必须在**系统终端**（PowerShell 或 cmd）中启动，并确保该变量未设置：
```cmd
set ELECTRON_RUN_AS_NODE=
npm start
```

## Architecture

OpenClaw Pet is a frameless, transparent, always-on-top Electron desktop pet. The app is split into two isolated processes:

**Main process** (`electron/main.js`):
- Creates 280×580px window positioned bottom-right
- Manages the OpenClaw Gateway subprocess (auto-spawned from `node_modules/openclaw`)
- Handles Win32 foreground window tracking (`electron/win32-monitor.js`)
- All LLM communication via `electron/llm-service.js` which connects to the Gateway over HTTP/WebSocket

**Renderer process** (`src/`):
- Pure ES modules, no bundler — `src/index.html` uses `<script type="module" src="app.js">`
- `src/app.js` exports `OpenClawPet` class which bootstraps and owns all subsystems
- No direct Node.js access — renderer talks to main exclusively via `window.electronAPI` (exposed by `electron/preload.js`)

**IPC bridge** (`electron/preload.js`):
- All renderer→main calls go through `window.electronAPI`
- Main→renderer events: `toggle-chat`, `chat-stream`, `agent-event`, `clipboard-changed`, `feed-pet`, `dock-target-update`, etc.
- Renderer→main: `chatSend(text, sessionKey)` → streaming; `chatWithAI(text)` → one-shot legacy; `expandWindow(bool)`, `setIgnoreMouse(bool)`, etc.

## Renderer Subsystems

```
src/app.js (OpenClawPet)
├── pet/PetRenderer.js         Canvas 2D renderer; wraps SpriteSheet + StateMachine
├── pet/StateMachine.js        Animation state transitions (idle/walk/sit/sleep/work/eat/…)
├── pet/Behaviors.js           Autonomous behavior scheduler (random movement, idle actions)
├── pet/MoodSystem.js          Mood level with time-based decay
├── pet/IntimacySystem.js      Growth stages 0-3, persistent via localStorage
├── pet/FeedingAnimator.js     4-phase feeding sequence
├── ui/ChatPanel.js            Full chat UI with streaming support
├── ui/StreamingBubble.js      Stacked speech bubbles (up to 8)
├── ui/BottomChatInput.js      Quick-input bar below the pet
├── ui/SettingsPanel.js        Config UI (model, personality, etc.)
├── interaction/DragHandler.js Window drag via moveWindow IPC
├── interaction/ClickHandler.js Single / double / long-press detection
├── interaction/FileDropHandler.js File drop → AI analysis → bubble or chat
└── interaction/ContextMenu.js Right-click menu
```

## Sprite System

Spritesheets live in `assets/sprites/placeholder/`. Each animation has a `.png` atlas and a `.json` descriptor with frame coordinates and timing. The main spritesheet (`spritesheet.png`) has 128×128 frames in an 8-col × 12-row grid. Compound animations (sleep, work) use separate enter/loop/exit sheets registered via `StateMachine.addCompoundAnimation()`.

Regenerate all sprites: `npm run generate-placeholder` (calls `scripts/generate-placeholder.js`).

## IntimacySystem Stages

| Stage | Points | Name | Spritesheet | CSS filter |
|-------|--------|------|-------------|------------|
| 0 | 0 | 幼猫 | kitten | scale(0.85) |
| 1 | 100 | 朋友 | adult | brightness(1.12) saturate(0.8) |
| 2 | 350 | 亲密伙伴 | adult | none |
| 3 | 800 | 心灵契合 | adult | saturate(1.25) brightness(0.92) |

Persisted to `localStorage['pet-intimacy']` as `{points, stage}`.

## Key Conventions

- **No bundler**: Do not introduce webpack/vite. Keep renderer as plain ES module imports.
- **IPC only**: Renderer must never use Node.js APIs directly. All system access goes through `window.electronAPI`.
- **Canvas rendering**: Pet animation runs via `requestAnimationFrame` in `PetRenderer`. Do not manipulate the canvas outside this class.
- **Streaming chat**: Use `electronAPI.chatSend()` + `onChatStream()` for new AI calls. `chatWithAI()` is legacy (one-shot, used only for quick bubble responses when chat panel is closed).
- **Persistent state**: Use `localStorage` for renderer-side persistence (mood, intimacy, settings cache). No files written from renderer.
