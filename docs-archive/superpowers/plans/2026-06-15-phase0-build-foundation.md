# Phase 0: 构建底座 (electron-vite + React + TS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SAEcom 从裸 JS + Electron 迁移到 electron-vite + React 18 + TypeScript(strict)，建立类型化 IPC 契约、Vitest 测试底座、Tailwind+shadcn 样式体系，并以"双轨并存"模式让新架构与现有 renderer.js 共存——所有现有功能行为不变。

**Architecture:** electron-vite 编译三入口（main/preload/renderer）。主进程 `main.js`(1334行) 迁移为 TS 并按 services/ 拆分。preload.ts 类型化暴露 `window.api`（契约定义在 `shared/types.ts`）。渲染层引入 React+Tailwind+shadcn，但 Phase 0 仅渲染一个空白 shell，通过 featureFlags 与 legacy renderer.js 共存。Vitest 接管现有 codegen 测试。

**Tech Stack:** electron-vite, React 18, TypeScript 5 (strict), Tailwind CSS 3, shadcn/ui, Zustand, Vitest, electron-builder (保留)

**Spec:** `docs/superpowers/specs/2026-06-15-react-rete-migration-design.md` §3

---

## File Structure

Phase 0 完成后的目录结构（仅 Phase 0 涉及的文件）：

```
SAEcom/
├─ electron/
│   ├─ main.ts                    # Create — 从 main.js 迁移（整体搬迁，行为不变）
│   ├─ preload.ts                 # Create — 从 preload.js 迁移，加类型
│   └─ services/                  # Phase 0 先不拆，Phase 1+ 再拆分 IPC handlers
├─ src/                           # 渲染进程
│   ├─ main.tsx                   # Create — createRoot 入口
│   ├─ App.tsx                    # Create — 应用壳 + featureFlags
│   ├─ components/
│   │   └─ ui/                    # Create — shadcn 组件目录（按需添加）
│   ├─ shared/
│   │   ├─ ipc/
│   │   │   └─ index.ts           # Create — useIPC() hook + 类型化 window.api
│   │   └─ store/
│   │       └── flags.ts          # Create — featureFlags (Zustand)
│   └─ styles/
│       └─ globals.css            # Create — Tailwind 指令 + shadcn 变量
├─ shared/
│   └─ types.ts                   # Create — IPC 契约类型定义
├─ test/
│   └─ code-generator.test.ts     # Migrate — 从 .js 迁移到 Vitest
├─ index.html                     # Modify — 挂载 React root + 保留 legacy 脚本
├─ panel.html                     # Modify — 挂载 React root（Phase 0 仅壳）
├─ electron.vite.config.ts        # Create — 三入口配置
├─ tsconfig.json                  # Create — strict
├─ tsconfig.node.json             # Create — main/preload 用
├─ tailwind.config.ts             # Create
├─ postcss.config.js              # Create
├─ components.json                # Create — shadcn 配置
├─ vitest.config.ts               # Create
└─ package.json                   # Modify — 脚本与依赖更新
```

**保留不动的 legacy 文件**（双轨并存，Phase 1+ 逐个删除）：`renderer.js`, `panel.js`, `styles.css`, `src/node-definitions.js`, `src/code-generator.js`, `src/flow-editor.js`

---

## Task 1: 初始化 electron-vite + TypeScript 工程骨架

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`
- Create: `electron/main.ts`, `electron/preload.ts`
- Create: `src/main.tsx`, `src/App.tsx`, `index.html`(临时替换)

**目的：** 先用最小可运行骨架验证 electron-vite 三入口能跑起来。此任务暂时让 React 应用成为唯一渲染层（legacy 暂时隔离），验证通过后 Task 6 再接入双轨并存。

- [ ] **Step 1: 安装核心依赖**

Run:
```bash
npm install --save-dev electron-vite vite typescript @types/react @types/react-dom @types/node vitest
npm install react react-dom
```

Expected: 依赖安装成功，`package.json` 出现新依赖。

- [ ] **Step 2: 创建 tsconfig.json（strict 模式，渲染进程用）**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"],
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "shared", "test"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: 创建 tsconfig.node.json（main/preload 用）**

Create `tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["electron"]
}
```

- [ ] **Step 4: 创建 electron.vite.config.ts**

Create `electron.vite.config.ts`:
```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    }
  },
  renderer: {
    root: 'src',
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') }
      }
    }
  }
})
```

- [ ] **Step 5: 安装 @vitejs/plugin-react**

Run:
```bash
npm install --save-dev @vitejs/plugin-react
```

Expected: 安装成功。electron.vite.config.ts 的 renderer 部分需要加 plugin。

- [ ] **Step 6: 给 electron.vite.config.ts 的 renderer 加上 react 插件**

Modify `electron.vite.config.ts` — 把 renderer 块改为：
```ts
  renderer: {
    root: 'src',
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') }
      }
    }
  }
```

- [ ] **Step 7: 创建临时 electron/main.ts（骨架版）**

此步骤用最小骨架验证构建链。真正的 main.js 迁移在 Task 4 做。

Create `electron/main.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'src')
  : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.VITE_PUBLIC, 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

- [ ] **Step 8: 创建临时 electron/preload.ts（骨架版）**

Create `electron/preload.ts`:
```ts
import { contextBridge } from 'electron'

// 临时骨架，真正迁移在 Task 5
contextBridge.exposeInMainWorld('api', {
  _placeholder: true
})
```

- [ ] **Step 9: 创建 src/index.html（electron-vite renderer 入口）**

注意：electron-vite 的 renderer root 是 `src`，所以 html 在 `src/index.html`。

Create `src/index.html`:
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>串口助手</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 10: 创建 src/main.tsx（React 入口骨架）**

Create `src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 11: 创建 src/App.tsx（骨架）**

Create `src/App.tsx`:
```tsx
export default function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>SAEcom React Shell (Phase 0 骨架)</h1>
      <p>electron-vite + React + TypeScript 已就绪。</p>
    </div>
  )
}
```

- [ ] **Step 12: 更新 package.json scripts**

Modify `package.json` — 把 scripts 替换为：
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "start": "electron-vite preview",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "postinstall": "electron-builder install-app-deps",
    "rebuild": "electron-rebuild -f -w serialport",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win nsis",
    "dist:mac": "npm run build && electron-builder --mac dmg",
    "dist:mac:universal": "npm run build && electron-builder --mac universal"
  }
}
```

注意：保留 `build` 字段（electron-builder 配置）原样不动。保留所有 dependencies（serialport, drawflow）。

- [ ] **Step 13: 运行 dev 验证骨架能启动**

Run:
```bash
npm run dev
```

Expected: Electron 窗口打开，显示 "SAEcom React Shell (Phase 0 骨架)"。devtools 打开。无报错。

如果 `preload.mjs` 找不到报错，确认 electron-vite 编译输出在 `out/` 或 `.vite/`，根据实际 electron-vite 版本调整 `main.ts` 里 preload 路径。electron-vite 默认输出 main 到 `out/main/index.js`，preload 到 `out/preload/index.mjs`。如果路径不符，把 `main.ts` 的 preload 路径改为 `path.join(__dirname, '../preload/index.mjs')`。

验证后关闭应用（Ctrl+C 终止 dev）。

- [ ] **Step 14: 提交**

```bash
git add -A
git commit -m "feat(phase0): electron-vite + React + TS 骨架搭建"
```

---

## Task 2: 建立类型化 IPC 契约 (shared/types.ts)

**Files:**
- Create: `shared/types.ts`
- Create: `test/types.test-d.ts` (类型测试)

**目的：** 定义 `window.api` 的完整类型契约。这是 Phase 0 最有结构性价值的产出——所有后续 IPC 调用都类型安全。

- [ ] **Step 1: 阅读现有 preload.js，提取所有 IPC 通道**

Run:
```bash
cat preload.js
```

确认以下 API 域（参考 preload.js 已知结构）：tcp, tcpServer, tcpShare, window, serial, panel, config, commands, file, logger, shell, scripts, app, changelog, theme, virtualPort。

- [ ] **Step 2: 创建 shared/types.ts**

Create `shared/types.ts`:
```ts
// ============ 基础类型 ============

export type WriteMode = 'text' | 'hex'
export type AppendMode = 'none' | 'LF' | 'CRLF'

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  vendorId?: string
  productId?: string
  serialNumber?: string
  pnpId?: string
}

export interface SerialOpenOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: string
  rtscts?: boolean
  xon?: boolean
  xoff?: boolean
  xany?: boolean
}

export interface WriteResult {
  ok: boolean
  error?: string
  bytes?: number
}

export interface DataPayload {
  id: string
  bytes: Uint8Array
  ts: number
}

export interface SerialEvent {
  id: string
  type: 'open' | 'close' | 'error'
  message?: string
}

export interface PanelPopoutOptions {
  id: string
  title: string
  historyStr: string
  alwaysOnTop: boolean
  isOpen: boolean
  viewMode: string
  optionsStr: string
}

export interface PanelConfig {
  id: string
  title?: string
  // 其余字段由 panels.json 实际内容决定，这里用宽松类型
  [key: string]: unknown
}

export interface ScriptRunContext {
  id: string
}

export interface ScriptEndedPayload {
  runId: string
  ok: boolean
  error?: string
  logs: string[]
}

// ============ API 域接口 ============

export interface SerialAPI {
  list: () => Promise<SerialPortInfo[]>
  open: (path: string, options: SerialOpenOptions) => Promise<{ ok: boolean; error?: string }>
  close: (id: string) => Promise<{ ok: boolean; error?: string }>
  write: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  onData: (cb: (p: DataPayload) => void) => void
  onEvent: (cb: (e: SerialEvent) => void) => void
}

export interface TcpAPI {
  open: (host: string, port: number, options: unknown) => Promise<{ ok: boolean; id?: string; error?: string }>
  write: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  close: (id: string) => Promise<{ ok: boolean; error?: string }>
  onData: (cb: (p: DataPayload) => void) => void
  onEvent: (cb: (e: SerialEvent) => void) => void
}

export interface TcpServerAPI {
  start: (port: number) => Promise<{ ok: boolean; id?: string; error?: string }>
  stop: (id: string) => Promise<{ ok: boolean; error?: string }>
  status: (id: string) => Promise<unknown>
  broadcast: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  onData: (cb: (p: { serverId: string; clientId: string; bytes: Uint8Array; ts: number }) => void) => void
  onEvent: (cb: (e: SerialEvent) => void) => void
}

export interface TcpShareAPI {
  start: (id: string, port: number) => Promise<unknown>
  stop: (id: string) => Promise<unknown>
  status: (id: string) => Promise<unknown>
}

export interface WindowAPI_Control {
  setFullscreen: (flag: boolean) => void
  toggleFullscreen: () => void
  focus: () => void
  setOscilloscopeTop: (flag: boolean) => void
}

export interface PanelAPI {
  popout: (id: string, title: string, historyStr: string, alwaysOnTop: boolean, isOpen: boolean, viewMode: string, optionsStr: string) => Promise<unknown>
  onFocusFromPopout: (cb: (p: { id: string }) => void) => void
  onDockRequest: (cb: (p: { id: string }) => void) => void
  onHideRequest: (cb: (p: { id: string }) => void) => void
  requestHide: (id: string) => void
  onLoadContent: (cb: (p: { id: string; historyStr: string }) => void) => void
  requestDock: (id: string, html: string) => void
  getPanelPortIdFromArgs: () => string | null
  saveLog: (name: string, content: string) => Promise<unknown>
}

export interface ConfigAPI {
  load: () => Promise<PanelConfig[]>
  save: (panels: PanelConfig[]) => void
}

export interface CommandsAPI {
  load: () => Promise<unknown[]>
  save: (cmds: unknown[]) => void
}

export interface FileAPI {
  readHex: (filePath: string) => Promise<unknown>
}

export interface LoggerAPI {
  append: (path: string, text: string) => Promise<unknown>
  pickFile: () => Promise<string | null>
}

export interface ScriptsAPI {
  dir: () => Promise<string>
  list: () => Promise<string[]>
  read: (name: string) => Promise<string>
  write: (name: string, content: string) => Promise<unknown>
  delete: (name: string) => Promise<unknown>
  run: (code: string, ctx: ScriptRunContext) => Promise<{ runId: string }>
  stop: (runId: string) => Promise<unknown>
  onEnded: (cb: (p: ScriptEndedPayload) => void) => void
}

export interface ShellAPI {
  openExternal: (url: string) => void
}

export interface AppAPI_Control {
  getVersion: () => Promise<string>
  checkUpdate: () => void
}

export interface ChangelogAPI {
  open: () => void
  request: () => void
  onLoad: (cb: (text: string) => void) => void
}

export interface ThemeAPI {
  set: (dark: boolean) => void
  onApply: (cb: (p: { dark: boolean }) => void) => void
}

export interface VirtualPortAPI {
  create: () => Promise<{ ok: boolean; pairId?: string; portA?: number; portB?: number; error?: string }>
  destroy: (pairId: string) => Promise<{ ok: boolean }>
  list: () => Promise<{ pairId: string; portA: number; portB: number }[]>
  restore: () => Promise<{ ok: boolean; pairId: string; portA: number; portB: number }[]>
}

// ============ 完整 window.api 类型 ============

export interface WindowAPI {
  serial: SerialAPI
  tcp: TcpAPI
  tcpServer: TcpServerAPI
  tcpShare: TcpShareAPI
  window: WindowAPI_Control
  panel: PanelAPI
  config: ConfigAPI
  commands: CommandsAPI
  file: FileAPI
  logger: LoggerAPI
  scripts: ScriptsAPI
  shell: ShellAPI
  app: AppAPI_Control
  changelog: ChangelogAPI
  theme: ThemeAPI
  virtualPort: VirtualPortAPI
}

declare global {
  interface Window {
    api: WindowAPI
  }
}
```

- [ ] **Step 3: 创建类型测试（确认类型可被消费）**

Create `test/types.test-d.ts`:
```ts
import { expectType } from 'tsd'
import type { WindowAPI, DataPayload, SerialOpenOptions } from '../shared/types'

// 确认 Window.api 类型存在且可被引用
expectType<WindowAPI['serial']>(null as any)
expectType<DataPayload>(null as any)
expectType<SerialOpenOptions>(null as any)
```

- [ ] **Step 4: 安装 tsd 用于类型测试（可选，仅当要跑类型测试时）**

Run:
```bash
npm install --save-dev tsd
```

Expected: 安装成功。

如果不想引入 tsd，可以跳过类型测试文件，改为依赖 `npm run typecheck` 做整体类型检查。

- [ ] **Step 5: 运行 typecheck 确认 shared/types.ts 无错误**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 无错误输出（exit 0）。

注意：tsconfig.json 的 include 需包含 `shared`，Task 1 Step 2 已配置。

- [ ] **Step 6: 提交**

```bash
git add shared/types.ts test/types.test-d.ts
git commit -m "feat(phase0): 类型化 IPC 契约 shared/types.ts"
```

---

## Task 3: 创建 useIPC hook + 类型安全的 API 客户端

**Files:**
- Create: `src/shared/ipc/index.ts`
- Create: `src/shared/store/flags.ts`

**目的：** 提供渲染层访问 `window.api` 的类型安全封装，并建立 featureFlags store 控制双轨并存。

- [ ] **Step 1: 创建 useIPC hook**

Create `src/shared/ipc/index.ts`:
```ts
import type { WindowAPI } from '@shared/types'

/**
 * 类型安全的 window.api 访问器。
 * 直接返回 window.api（preload 已通过 contextBridge 暴露），仅做类型断言。
 */
export function useIPC(): WindowAPI {
  if (!window.api) {
    throw new Error('window.api 未注入——请确认 preload 已加载')
  }
  return window.api
}

/**
 * 非-hook 版本，用于 React 组件树外（如事件回调、store action）
 */
export function getIPC(): WindowAPI {
  if (!window.api) {
    throw new Error('window.api 未注入——请确认 preload 已加载')
  }
  return window.api
}
```

- [ ] **Step 2: 安装 zustand**

Run:
```bash
npm install zustand
```

Expected: 安装成功。

- [ ] **Step 3: 创建 featureFlags store**

Create `src/shared/store/flags.ts`:
```ts
import { create } from 'zustand'

interface FlagsState {
  /** Phase 1 完成后开启：脚本编辑器走 React+Rete */
  useReactScriptEditor: boolean
  /** Phase 2 完成后开启：串口面板走 React */
  useReactPanels: boolean
  /** Phase 3+ 后续 */
  useReactCommands: boolean
  useReactSettings: boolean
  setFlag: (key: keyof Omit<FlagsState, 'setFlag'>, value: boolean) => void
}

export const useFlags = create<FlagsState>((set) => ({
  // Phase 0：全部 false，legacy renderer.js 接管所有 UI
  useReactScriptEditor: false,
  useReactPanels: false,
  useReactCommands: false,
  useReactSettings: false,
  setFlag: (key, value) => set({ [key]: value } as Partial<FlagsState>)
}))
```

- [ ] **Step 4: 运行 typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/shared/ipc/index.ts src/shared/store/flags.ts
git commit -m "feat(phase0): useIPC hook + featureFlags store"
```

---

## Task 4: 迁移 main.js → electron/main.ts（行为不变）

**Files:**
- Create: `electron/main.ts`（替换 Task 1 的骨架版）
- Reference: `main.js`（源文件，1334 行）

**目的：** 把现有 main.js 整体迁移为 TypeScript，**所有 IPC handler 行为完全不变**。此任务不拆分 services/（那是后续优化），只做 1:1 迁移 + 类型标注。

**关键约束：** 不改变任何 IPC 通道名、参数格式、返回值。preload.js 暴露的 API 签名不变。

- [ ] **Step 1: 完整阅读 main.js**

Run:
```bash
cat main.js
```

通读全部 1334 行，理解所有 ipcMain.handle / ipcMain.on 通道。重点关注：
- `createMainWindow()` 中的 webPreferences（contextIsolation, preload 路径）
- `app.whenReady()` 的初始化逻辑
- 所有 `ipcMain.handle('xxx', ...)` 和 `ipcMain.on('xxx', ...)`

- [ ] **Step 2: 创建 electron/main.ts，迁移全部代码**

把 `main.js` 全文复制到 `electron/main.ts`，做以下 TypeScript 化改动：

1. **顶部 require → import**：
   ```ts
   // 原:
   const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
   // 改为:
   import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
   import { SerialPort } from 'serialport'
   import { randomUUID } from 'crypto'
   import path from 'node:path'
   import fs from 'node:fs'
   import vm from 'node:vm'
   import https from 'node:https'
   import { execFile, spawn } from 'node:child_process'
   import os from 'node:os'
   import net from 'node:net'
   ```

2. **`__dirname` 处理**：electron-vite 编译后 ESM 环境下 `__dirname` 不可用。在文件顶部加：
   ```ts
   import { fileURLToPath } from 'node:url'
   const __dirname = path.dirname(fileURLToPath(import.meta.url))
   ```
   但注意：electron-vite 的 main 进程默认编译为 CommonJS（`"type": "commonjs"` 或无 type），`__dirname` 可用。**如果 package.json 没有 `"type": "module"`，则不需要 fileURLToPath，`__dirname` 直接可用。** 确认 package.json 无 `"type": "module"` 后，保留原 `__dirname` 用法即可。

3. **`iconv` 动态 require 保留**：
   ```ts
   let iconv: any = null
   try { iconv = require('iconv-lite') } catch { iconv = null }
   ```
   （iconv-lite 是可选依赖，保持 try-catch）

4. **preload 路径适配**：把 `createMainWindow()` 里的 preload 路径改为适配 electron-vite 输出：
   ```ts
   // 原: preload: path.join(__dirname, 'preload.js')
   // electron-vite 编译后输出到 out/preload/index.mjs
   preload: path.join(__dirname, '../preload/index.mjs')
   ```
   注意：如果 Task 1 Step 13 验证时发现路径不同，以实际 electron-vite 输出路径为准。

5. **`mainWindow.loadFile('index.html')` 改为 dev/prod 分支**：
   ```ts
   if (process.env.VITE_DEV_SERVER_URL) {
     mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
   } else {
     mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
   }
   ```
   （electron-vite renderer root 是 src，prod 输出到 out/renderer）

6. **其余代码（所有 ipcMain handler、函数逻辑）原样保留**。给 Map 变量加类型标注：
   ```ts
   const ports = new Map<string, any>()
   const runningScripts = new Map<string, any>()
   // ... 其他 Map 类似
   ```
   不追求完美类型（Phase 0 目标是行为不变），用 `any` 或宽松类型即可。

7. **弹出窗口的 loadFile 也需要适配**：找到 `panel:popout` handler 里创建弹出窗口的部分，`loadFile('panel.html')` 改为：
   ```ts
   if (process.env.VITE_DEV_SERVER_URL) {
     popoutWin.loadURL(process.env.VITE_DEV_SERVER_URL + '/panel.html')
   } else {
     popoutWin.loadFile(path.join(__dirname, '../renderer/panel.html'))
   }
   ```
   （Phase 0 的 panel.html 还没建 React 版，这里先指向 Task 6 会创建的路径。如果 panel.html 在 dev 模式下 404，临时让弹出窗口在 dev 模式加载 legacy panel.html 即可——Phase 2 会正式处理。）

- [ ] **Step 3: 运行 typecheck（main 进程）**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 无错误。如果有类型错误，用 `// @ts-expect-error 迁移中` 或宽松类型标注绕过——Phase 0 不追求 main 进程类型完美，只求能编译运行。

- [ ] **Step 4: 删除旧的 main.js**

确认 `electron/main.ts` 能编译运行后，删除 `main.js`：
```bash
git rm main.js
```

注意：删除前确认 `package.json` 的 `"main"` 字段已不需要指向 main.js。electron-vite 的 main 入口由 `electron.vite.config.ts` 配置，编译输出到 `out/main/index.js`，electron 启动时指向 `out/main/index.js`。

检查 package.json：electron-builder 需要知道主进程入口。在 build 配置里确认或添加：
```json
"build": {
  ...
  "main": "out/main/index.js"
}
```
（如果 electron-vite 版本要求显式指定）

- [ ] **Step 5: 运行 dev 验证主进程加载正常**

Run:
```bash
npm run dev
```

Expected: Electron 窗口打开，显示 React shell（Task 1 的骨架）。devtools 中无 main 进程报错。

此时 window.api 还是骨架版（Task 1 Step 8 的 placeholder），因为 preload.ts 还没迁移。Task 5 会修复。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(phase0): main.js → electron/main.ts 迁移 (行为不变)"
```

---

## Task 5: 迁移 preload.js → electron/preload.ts（类型化）

**Files:**
- Create: `electron/preload.ts`（替换 Task 1 的骨架版）
- Reference: `preload.js`（源文件）

**目的：** 把 preload.js 迁移为 TypeScript，实现 shared/types.ts 定义的 WindowAPI 契约。**所有 IPC 通道名和参数格式不变。**

- [ ] **Step 1: 创建 electron/preload.ts**

Create `electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import { shell } from 'electron'
import type { WindowAPI } from '../shared/types'

function decodeBase64ToUint8Array(b64: string): Uint8Array {
  const buf = Buffer.from(b64, 'base64')
  return new Uint8Array(buf)
}

const api: WindowAPI = {
  tcp: {
    open: (host, port, options) => ipcRenderer.invoke('tcp:open', { host, port, options }),
    write: (id, data, mode, append, encoding) => ipcRenderer.invoke('tcp:write', { id, data, mode, append, encoding }),
    close: (id) => ipcRenderer.invoke('tcp:close', { id }),
    onData: (cb) => ipcRenderer.on('tcp:data', (_e, p) => cb({ id: p.id, bytes: decodeBase64ToUint8Array(p.base64), ts: p.ts })),
    onEvent: (cb) => ipcRenderer.on('tcp:event', (_e, p) => cb(p))
  },
  tcpServer: {
    start: (port) => ipcRenderer.invoke('tcpServer:start', { port }),
    stop: (id) => ipcRenderer.invoke('tcpServer:stop', { id }),
    status: (id) => ipcRenderer.invoke('tcpServer:status', { id }),
    broadcast: (id, data, mode, append, encoding) => ipcRenderer.invoke('tcpServer:broadcast', { id, data, mode, append, encoding }),
    onData: (cb) => ipcRenderer.on('tcpServer:data', (_e, p) => cb({ serverId: p.serverId, clientId: p.clientId, bytes: decodeBase64ToUint8Array(p.base64), ts: p.ts })),
    onEvent: (cb) => ipcRenderer.on('tcpServer:event', (_e, p) => cb(p))
  },
  tcpShare: {
    start: (id, port) => ipcRenderer.invoke('tcpShare:start', { id, port }),
    stop: (id) => ipcRenderer.invoke('tcpShare:stop', { id }),
    status: (id) => ipcRenderer.invoke('tcpShare:status', { id })
  },
  window: {
    setFullscreen: (flag) => ipcRenderer.send('window:set-fullscreen', { flag }),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
    focus: () => ipcRenderer.send('window:focus'),
    setOscilloscopeTop: (flag) => ipcRenderer.send('window:set-oscilloscope-top', { flag })
  },
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    open: (path, options) => ipcRenderer.invoke('serial:open', { path, options }),
    close: (id) => ipcRenderer.invoke('serial:close', { id }),
    write: (id, data, mode = 'text', append = 'none', encoding = 'utf-8') =>
      ipcRenderer.invoke('serial:write', { id, data, mode, append, encoding }),
    onData: (cb) => {
      ipcRenderer.on('serial:data', (_e, payload) => {
        cb({ id: payload.id, bytes: decodeBase64ToUint8Array(payload.base64), ts: payload.ts })
      })
    },
    onEvent: (cb) => {
      ipcRenderer.on('serial:event', (_e, payload) => cb(payload))
    }
  },
  panel: {
    popout: (id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr) =>
      ipcRenderer.invoke('panel:popout', { id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr }),
    onFocusFromPopout: (cb) => ipcRenderer.on('panel:focus', (_e, payload) => cb(payload)),
    onDockRequest: (cb) => ipcRenderer.on('panel:dock', (_e, payload) => cb(payload)),
    onHideRequest: (cb) => ipcRenderer.on('panel:hide', (_e, payload) => cb(payload)),
    requestHide: (id) => ipcRenderer.send('panel:request-hide', { id }),
    onLoadContent: (cb) => ipcRenderer.on('panel:loadContent', (_e, payload) => cb(payload)),
    requestDock: (id, html) => ipcRenderer.send('panel:request-dock', { id, html }),
    getPanelPortIdFromArgs: () => {
      const arg = (process.argv || []).find((a: string) => a.startsWith('--panelPortId='))
      if (!arg) return null
      return decodeURIComponent(arg.split('=')[1])
    },
    saveLog: (name, content) => ipcRenderer.invoke('panel:saveLog', { name, content })
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (panels) => ipcRenderer.send('config:save', panels)
  },
  commands: {
    load: () => ipcRenderer.invoke('commands:load'),
    save: (cmds) => ipcRenderer.send('commands:save', cmds)
  },
  file: {
    readHex: (filePath) => ipcRenderer.invoke('file:readHex', filePath)
  },
  logger: {
    append: (path, text) => ipcRenderer.invoke('logger:append', path, text),
    pickFile: () => ipcRenderer.invoke('logger:pickFile')
  },
  shell: {
    openExternal: (url) => shell.openExternal(url)
  },
  scripts: {
    dir: () => ipcRenderer.invoke('scripts:dir'),
    list: () => ipcRenderer.invoke('scripts:list'),
    read: (name) => ipcRenderer.invoke('scripts:read', name),
    write: (name, content) => ipcRenderer.invoke('scripts:write', { name, content }),
    delete: (name) => ipcRenderer.invoke('scripts:delete', name),
    run: (code, ctx) => ipcRenderer.invoke('scripts:run', { code, ctx }),
    stop: (runId) => ipcRenderer.invoke('scripts:stop', { runId }),
    onEnded: (cb) => ipcRenderer.on('scripts:ended', (_e, payload) => cb(payload))
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    checkUpdate: () => ipcRenderer.send('app:checkUpdate')
  },
  changelog: {
    open: () => ipcRenderer.send('changelog:open'),
    request: () => ipcRenderer.send('changelog:request'),
    onLoad: (cb) => ipcRenderer.on('changelog:content', (_e, text) => cb(text))
  },
  theme: {
    set: (dark) => ipcRenderer.send('theme:set', { dark }),
    onApply: (cb) => ipcRenderer.on('theme:apply', (_e, payload) => cb(payload))
  },
  virtualPort: {
    create: () => ipcRenderer.invoke('virtualPort:create'),
    destroy: (pairId) => ipcRenderer.invoke('virtualPort:destroy', { pairId }),
    list: () => ipcRenderer.invoke('virtualPort:list'),
    restore: () => ipcRenderer.invoke('virtualPort:restore')
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: 删除旧的 preload.js**

```bash
git rm preload.js
```

- [ ] **Step 3: 运行 typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 无错误。如果 preload.ts 引用的 shared/types.ts 的某个类型与实际 preload.js 行为有出入，修正 shared/types.ts 的类型定义以匹配实际行为（类型服务于实现，不反过来）。

- [ ] **Step 4: 运行 dev 验证 window.api 可用**

Run:
```bash
npm run dev
```

在打开的应用中打开 devtools console，输入：
```js
window.api.serial.list()
```

Expected: 返回一个 Promise（串口列表）。无 "api is undefined" 错误。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(phase0): preload.js → electron/preload.ts 类型化迁移"
```

---

## Task 6: 双轨并存 — 接入 legacy renderer.js

**Files:**
- Modify: `src/index.html`
- Create: `src/legacy-loader.ts`
- Reference: `index.html`（原 legacy 入口）, `renderer.js`, `src/node-definitions.js`, `src/code-generator.js`, `src/flow-editor.js`

**目的：** 让 legacy renderer.js 与 React shell 在同一页面共存。React 渲染到 `#root`，legacy 脚本继续操作它原有的 DOM（`#app`）。

**核心问题：** legacy 代码依赖 `<script src="renderer.js">` 的全局加载，且依赖 DOMContentLoaded。React 的 `#root` 和 legacy 的 `#app` 要在同一个 HTML 里。

- [ ] **Step 1: 修改 src/index.html，加入 legacy DOM + 脚本**

Modify `src/index.html` 为：
```html
<!doctype html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8" />
    <title>串口助手</title>
    <link rel="stylesheet" href="./styles.css" />
    <link rel="stylesheet" href="node_modules/drawflow/dist/drawflow.min.css">
</head>

<body>
    <!-- React 挂载点（Phase 0 暂为空壳，Phase 1+ 逐步填充） -->
    <div id="root"></div>

    <!-- Legacy 应用 DOM（renderer.js 操作的区域） -->
    <div id="app">
        <aside id="sidebar" class="open">
            <div class="sidebar-header">
                <button id="toggleSidebar">≡</button>
                <span>串口窗口</span>
            </div>
            <div class="sidebar-actions">
                <button id="btnNew">新建面板</button>
                <button id="btnRefreshPorts">刷新串口</button>
                <button id="btnNewVPort">虚拟串口对</button>
            </div>
            <ul id="panelList"></ul>
            <div class="sidebar-footer">
                <button id="btnSettings">设置</button>
            </div>
        </aside>
    </div>

    <!-- React 入口 -->
    <script type="module" src="./main.tsx"></script>

    <!-- Legacy 脚本（保持原有加载顺序） -->
    <script src="src/node-definitions.js"></script>
    <script>
        (function() {
            var script = document.createElement('script');
            script.src = 'src/code-generator.js?t=' + Date.now();
            document.body.appendChild(script);
        })();
    </script>
    <script src="node_modules/drawflow/dist/drawflow.min.js"></script>
    <script src="src/flow-editor.js"></script>
    <script src="./renderer.js"></script>
</body>

</html>
```

**注意：** 这里把原 index.html 的完整 DOM 搬进来了。原 index.html 的 body 内容（从 `<div id="app">` 到所有 dialog）需要完整保留——上面的片段只展示了开头，实际操作时需要把原 `index.html` 的 `<div id="app">...</div>` 全部内容（含所有 dialog）原样搬入新 `src/index.html`，在 `</body>` 前插入 React 的 `<div id="root"></div>` 和 `<script type="module" src="./main.tsx"></script>`。

**关键：** `<div id="root"></div>` 放在 `<div id="app">` **之前**（或用 CSS 让它们不重叠）。Phase 0 阶段 React root 内容是空壳（或隐藏），legacy 的 `#app` 正常显示。

- [ ] **Step 2: 让 React shell 在 Phase 0 不抢占视觉空间**

修改 `src/App.tsx`：
```tsx
import { useFlags } from './shared/store/flags'

export default function App() {
  const useReactScriptEditor = useFlags((s) => s.useReactScriptEditor)
  const useReactPanels = useFlags((s) => s.useReactPanels)

  // Phase 0：所有 flag 为 false，React 不渲染任何业务 UI
  // 仅当某个 flag 开启时才渲染对应模块（Phase 1+ 实现）
  return (
    <>
      {useReactScriptEditor && <div>ScriptEditor (Phase 1)</div>}
      {useReactPanels && <div>PanelContainer (Phase 2)</div>}
    </>
  )
}
```

这样 Phase 0 阶段 React root 渲染为空 fragment，不干扰 legacy。

- [ ] **Step 3: 确保 #root 不占据布局空间**

在 `src/App.tsx` 顶部或创建 `src/styles/react-shell.css`（Phase 0 暂不需要正式样式），用内联样式确保 root 不影响 legacy：
```tsx
// main.tsx 的 root div 已在 DOM 中，App 返回空 fragment 即可
// 如果 #root 有默认 margin/padding，在 index.html 加：
// <style>#root { display: none; }</style>
```

在 `src/index.html` 的 `<head>` 加：
```html
<style>#root { display: none; }</style>
```
（Phase 1 启用 React 时移除此规则，改为按需显示）

- [ ] **Step 4: 运行 dev 验证双轨共存**

Run:
```bash
npm run dev
```

Expected: 应用界面与**迁移前视觉完全一致**——legacy 的串口面板、侧栏、设置全部正常。React 在后台加载但不显示。

测试 checklist：
- 侧栏端口列表正常
- 能打开串口面板
- 能打开脚本编辑器（Drawflow 版）
- 设置页正常
- 夜间模式切换正常

如果任何 legacy 功能异常，检查 `src/index.html` 是否完整保留了原 DOM 结构和脚本加载顺序。

- [ ] **Step 5: 提交**

```bash
git add src/index.html src/App.tsx
git commit -m "feat(phase0): 双轨并存 - legacy renderer.js 与 React 共存"
```

---

## Task 7: Vitest 测试底座 + 迁移 codegen 测试

**Files:**
- Create: `vitest.config.ts`
- Migrate: `test/code-generator.test.js` → `test/code-generator.test.ts`
- Reference: `test/code-generator.test.js`（源文件）

**目的：** 用 Vitest 接管测试，把现有 18 个 codegen 测试用例迁移过来，作为后续 codegen 重写（Phase 1）的回归基线。

- [ ] **Step 1: 创建 vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false
  }
})
```

- [ ] **Step 2: 阅读 test/code-generator.test.js**

Run:
```bash
cat test/code-generator.test.js
```

通读全部，理解：
- 手写的 `test()` / `assertEqual` / `assertContains` / `assertMatches` helper
- `createDrawflow(nodes, connections)` helper
- 18 个测试用例
- 它 import 的是 `src/code-generator.js` 的 `generateCodeFromDrawflow`

- [ ] **Step 3: 迁移测试文件为 TypeScript + Vitest**

Create `test/code-generator.test.ts`（基于原文件改写）：

把原有的手写 test framework 替换为 Vitest API。核心改动：

```ts
import { describe, it, expect } from 'vitest'
import { generateCodeFromDrawflow } from '../src/code-generator'

// 原有的 NODE_DEFS stub 原样保留
const NODE_DEFS = {
  // ... 从原文件复制
}

// 原有的 createDrawflow helper 原样保留
function createDrawflow(nodes: any[], connections: any[]) {
  // ... 从原文件复制
}

describe('code-generator', () => {
  // 把每个原 test('xxx', () => {...}) 改为 it('xxx', () => {...})
  // 把 assertEqual(a, b) 改为 expect(a).toBe(b)
  // 把 assertContains(str, sub) 改为 expect(str).toContain(sub)
  // 把 assertMatches(str, regex) 改为 expect(str).toMatch(regex)

  it('简单链式：input→transform→output', () => {
    const df = createDrawflow(
      [{ id: 1, name: '接收串口', class: 'input-serial' },
       { id: 2, name: 'HEX转换', class: 'transform-hex' },
       { id: 3, name: '发送串口', class: 'output-serial' }],
      [[1, 2], [2, 3]]
    )
    const code = generateCodeFromDrawflow(df, NODE_DEFS)
    expect(code).toContain('var _out_1')
    expect(code).toContain('var _out_2')
  })

  // ... 对所有 18 个用例做同样的改写
})
```

**关键：** 测试逻辑和断言内容**完全不变**，只换测试框架 API。NODE_DEFS stub 和 createDrawflow helper 原样保留。

**注意 import 路径：** `src/code-generator.js` 是 CommonJS（module.exports），Vitest 能直接 import CommonJS。`import { generateCodeFromDrawflow } from '../src/code-generator'` 即可（不加 .js 扩展名）。

- [ ] **Step 4: 删除旧的 test/code-generator.test.js**

```bash
git rm test/code-generator.test.js
```

- [ ] **Step 5: 运行测试**

Run:
```bash
npm test
```

Expected: 18 个测试全部 PASS。

如果有失败，检查：
- import 路径是否正确
- NODE_DEFS stub 是否完整（特别是 control-condition vs control-if 的 key）
- createDrawflow 的 connections 格式

- [ ] **Step 6: 提交**

```bash
git add vitest.config.ts test/code-generator.test.ts
git commit -m "feat(phase0): Vitest 测试底座 + codegen 18 用例迁移"
```

---

## Task 8: Tailwind CSS + shadcn/ui 初始化

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`
- Create: `src/styles/globals.css`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`（第一个 shadcn 组件）

**目的：** 建立 Tailwind + shadcn 基础设施，为 Phase 1/2 的组件做准备。Phase 0 不实际使用样式（legacy styles.css 仍负责全部视觉），只搭建配置。

- [ ] **Step 1: 安装 Tailwind 及相关依赖**

Run:
```bash
npm install -D tailwindcss@3 postcss autoprefixer
npm install -D @types/node
npm install class-variance-authority clsx tailwind-merge
npm install tailwindcss-animate
```

Expected: 安装成功。

注意：用 Tailwind v3（非 v4），v3 与 shadcn 兼容性最佳。

- [ ] **Step 2: 初始化 Tailwind 配置**

Create `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [animate]
}

export default config
```

- [ ] **Step 3: 创建 postcss.config.js**

Create `postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 4: 创建 globals.css（shadcn 变量 + Tailwind 指令）**

Create `src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 20% 98%;
    --foreground: 222 47% 11%;

    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;

    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;

    --primary: 221 83% 53%;
    --primary-foreground: 210 40% 98%;

    --secondary: 210 40% 96%;
    --secondary-foreground: 222 47% 11%;

    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;

    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 210 40% 98%;

    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 221 83% 53%;

    --radius: 0.5rem;
  }

  .dark {
    --background: 222 47% 11%;
    --foreground: 210 40% 98%;

    --card: 222 47% 11%;
    --card-foreground: 210 40% 98%;

    --popover: 222 47% 11%;
    --popover-foreground: 210 40% 98%;

    --primary: 217 91% 60%;
    --primary-foreground: 222 47% 11%;

    --secondary: 217 33% 17%;
    --secondary-foreground: 210 40% 98%;

    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;

    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;

    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;

    --border: 217 33% 20%;
    --input: 217 33% 20%;
    --ring: 224 76% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**注意：** 这些是 shadcn 默认色值。Phase 1 会把现有 styles.css 的品牌色映射进来。Phase 0 先用默认值。

- [ ] **Step 5: 在 main.tsx 引入 globals.css**

Modify `src/main.tsx`：
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 6: 创建 components.json（shadcn 配置）**

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 创建 src/lib/utils.ts**

Create `src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 8: 添加第一个 shadcn 组件（button）用于验证**

创建 `src/components/ui/button.tsx`（手动创建，避免依赖 shadcn CLI）：

Create `src/components/ui/button.tsx`:
```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

- [ ] **Step 9: 运行 dev 验证 Tailwind 编译正常**

Run:
```bash
npm run dev
```

Expected: 应用正常启动，无 Tailwind/PostCSS 编译错误。devtools 中确认 globals.css 的 Tailwind 指令已编译。

- [ ] **Step 10: 运行 typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 无错误。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat(phase0): Tailwind CSS + shadcn/ui 基础设施"
```

---

## Task 9: panel.html 双轨接入

**Files:**
- Create: `src/panel.html`
- Create: `src/panel.tsx`
- Reference: `panel.html`（原 legacy 文件）, `panel.js`

**目的：** 弹出窗口的 HTML 也要适配 electron-vite renderer。Phase 0 阶段 panel.html 仍加载 legacy panel.js（弹出窗口功能不变），React 仅作空壳存在。

**关键：** electron-vite 的 renderer root 是 `src`，所以 panel.html 要放在 `src/` 下。但 electron.vite.config.ts 的 renderer build input 目前只配置了 index。需要加 panel 入口。

- [ ] **Step 1: 更新 electron.vite.config.ts 加入 panel 入口**

Modify `electron.vite.config.ts` 的 renderer.build.rollupOptions：
```ts
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
          panel: resolve(__dirname, 'src/panel.html')
        }
      }
    }
```

- [ ] **Step 2: 创建 src/panel.html（legacy 内容 + React root）**

把原 `panel.html` 的完整内容搬入 `src/panel.html`，在 `<body>` 开头加 React root，在末尾加 React 入口脚本：

Create `src/panel.html`（结构示意，实际需包含原 panel.html 全部内容）：
```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <title>串口面板</title>
    <link rel="stylesheet" href="./styles.css" />
</head>
<body>
    <!-- React 挂载点（Phase 0 空壳） -->
    <div id="root" style="display:none;"></div>

    <!-- Legacy panel DOM（原 panel.html 内容原样保留） -->
    <div id="title-bar"><!-- 原内容 --></div>
    <div id="display"><!-- 原内容 --></div>
    <!-- ... 原 panel.html 的所有 DOM ... -->

    <!-- React 入口 -->
    <script type="module" src="./panel.tsx"></script>

    <!-- Legacy 脚本 -->
    <script src="./panel.js"></script>
</body>
</html>
```

**注意：** 实际操作时，读取原 `panel.html` 全文，完整复制到 `src/panel.html`，只在 `<body>` 开头插入 `<div id="root" style="display:none;"></div>`，在末尾 `</body>` 前插入 `<script type="module" src="./panel.tsx"></script>`。

- [ ] **Step 3: 创建 src/panel.tsx（React 空壳）**

Create `src/panel.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'

// Phase 0：弹出窗口仍由 legacy panel.js 渲染
// Phase 2 会实现 <PopoutPanel panelId={...} />
function PanelRoot() {
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PanelRoot />
  </React.StrictMode>
)
```

- [ ] **Step 4: 删除旧的 panel.html（根目录）**

```bash
git rm panel.html
```

注意：`panel.js` 暂时保留在根目录。但 `src/panel.html` 里的 `<script src="./panel.js">` 路径——在 electron-vite dev 模式下，renderer root 是 `src`，`./panel.js` 相对于 src 目录会找不到。需要把 panel.js 移到 src/ 下，或调整路径。

把 `panel.js` 移到 `src/`：
```bash
git mv panel.js src/panel.js
```

然后 `src/panel.html` 的脚本路径 `<script src="./panel.js">` 就能正确解析（相对于 src 目录）。

- [ ] **Step 5: 更新 electron/main.ts 中弹出窗口的加载路径**

确认 `panel:popout` handler 里创建弹出窗口的 loadFile 路径。electron-vite prod 模式下 panel.html 输出到 `out/renderer/panel.html`：
```ts
// 在 panel:popout handler 中
if (process.env.VITE_DEV_SERVER_URL) {
  popoutWin.loadURL(process.env.VITE_DEV_SERVER_URL + '/panel.html')
} else {
  popoutWin.loadFile(path.join(__dirname, '../renderer/panel.html'))
}
```

如果 Task 4 已经做了这个改动，确认即可。

- [ ] **Step 6: 运行 dev 验证弹出窗口正常**

Run:
```bash
npm run dev
```

测试：打开主窗口 → 连接串口 → 面板弹出为独立窗口 → 确认弹出窗口显示正常（legacy panel.js 渲染），能收发数据。

如果弹出窗口白屏，检查 devtools console 的资源加载错误（404）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(phase0): panel.html 双轨接入 electron-vite"
```

---

## Task 10: 整体验证 + 打包测试

**目的：** 验证 Phase 0 所有验收标准，确认构建和打包正常。

- [ ] **Step 1: 运行完整 typecheck**

Run:
```bash
npm run typecheck
```

Expected: main（tsconfig.node.json）和 renderer（tsconfig.json）都无错误。

- [ ] **Step 2: 运行测试**

Run:
```bash
npm test
```

Expected: codegen 18 用例全部 PASS。

- [ ] **Step 3: 运行 dev 完整功能验证**

Run:
```bash
npm run dev
```

逐项验证（与迁移前行为对比）：
- [ ] 侧栏端口列表正常显示
- [ ] 能扫描/连接串口
- [ ] 能打开串口面板，收发数据
- [ ] TCP 连接正常
- [ ] 面板弹出/停靠正常
- [ ] 脚本编辑器（Drawflow）正常打开/编辑/运行
- [ ] 命令系统正常
- [ ] 设置页正常
- [ ] 夜间模式切换正常
- [ ] HEX 显示切换正常

如果有任何异常，对照该功能的 legacy 代码，检查 src/index.html 是否完整保留了对应 DOM 和脚本。

- [ ] **Step 4: 运行构建**

Run:
```bash
npm run build
```

Expected: electron-vite 编译三入口（main/preload/renderer），输出到 `out/` 目录，无错误。

- [ ] **Step 5: 打包测试（Windows）**

Run:
```bash
npm run dist:win
```

Expected: electron-builder 打出 NSIS 安装包到 `dist/` 目录，无错误。

如果 serialport 原生模块 rebuild 报错，运行 `npm run rebuild` 后重试。

- [ ] **Step 6: 安装并验证打包后的应用**

运行打出的安装包，安装后启动应用，确认：
- [ ] 应用正常启动
- [ ] 界面完整（非白屏）
- [ ] 核心功能可用（串口连接）

- [ ] **Step 7: 最终提交**

```bash
git add -A
git commit -m "feat(phase0): Phase 0 完成 - 验证通过"
```

---

## Phase 0 完成验收标准对照

来自 spec §3.8：

1. ✅ `npm run dev` 启动 electron-vite，HMR 生效，应用界面与现在视觉一致 — Task 10 Step 3
2. ✅ `npm run build && npm run dist:win` 能打出可安装包 — Task 10 Step 4/5
3. ✅ `window.api` 全部类型化，渲染进程 TS 无 any — Task 2/5
4. ✅ 现有所有功能行为不变 — Task 6/10
5. ✅ `npm test`（Vitest）跑通 codegen 18 用例 — Task 7

---

## 注意事项

### electron-vite 版本兼容

electron-vite 的输出路径可能因版本而异。如果 Task 1 Step 13 遇到 preload 路径问题，检查 `out/` 目录结构：
```bash
ls out/
ls out/main/
ls out/preload/
```
根据实际输出调整 `electron/main.ts` 里的 preload 路径和 loadFile 路径。

### serialport 原生模块

serialport 是原生模块，electron-vite 的 `externalizeDepsPlugin()` 会将其外部化。打包时 electron-builder 的 `asarUnpack: ["**/*.node"]` 配置（已在 package.json build 配置中）确保原生模块正确解包。如果运行时报 "Cannot find module serialport"，运行 `npm run rebuild`。

### 双轨并存的 IPC 监听冲突

Phase 0 阶段 legacy renderer.js 和 React 都存在于页面，但 React（App.tsx）不订阅任何 IPC 事件（返回空 fragment）。所以不存在 IPC 监听冲突。Phase 1 启用脚本编辑器时，需确保 React 版和 legacy 版不同时监听同一 IPC 通道——由 featureFlags 控制。

### legacy 文件清理时机

Phase 0 保留所有 legacy 文件（renderer.js, panel.js, styles.css, src/*.js）。这些文件在 Phase 1（脚本编辑器迁移完成后删除 flow-editor/code-generator/node-definitions/drawflow）、Phase 2（面板迁移完成后删除 renderer.js）、Phase 5（全部清理）逐步删除。
