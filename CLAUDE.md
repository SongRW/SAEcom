# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SAEcom (串口助手) is an Electron-based multi-panel serial-port assistant. It is mid-migration from a single-file vanilla-JS renderer to electron-vite + React + TypeScript. See `AGENTS.md` for contributor conventions and `docs/superpowers/specs/2026-06-15-react-rete-migration-design.md` for the full migration design (the authoritative architecture reference). UI text and many comments are in Chinese.

## Commands

- `npm run dev` — start the electron-vite dev workflow. **Must go through `scripts/dev.js`**, which deletes `ELECTRON_RUN_AS_NODE` before launching; running `electron-vite dev` directly in this environment forces Electron into pure-Node mode (`app`/`BrowserWindow` undefined).
- `npm run build` — build main, preload, and renderer bundles.
- `npm run typecheck` — `tsc` against both `tsconfig.json` (app/renderer) and `tsconfig.node.json` (electron/shared). Run before submitting.
- `npm test` — Vitest once. `npm run test:watch` for watch mode.
- `npm run test:e2e` — Playwright Electron E2E (needs `npm run build` first). `npm run test:e2e:build` does both in one shot — the recommended command for UI changes.
- Run a single E2E spec: `npx playwright test e2e/tcp-panel.spec.ts` (append `-g "<name>"` to filter by test title).
- `npm run typecheck:e2e` — typecheck the `e2e/` specs.
- Run a single test: `npx vitest run test/rete-codegen.test.ts` (or `-t "<name>"` to filter by test name).
- `npm run rebuild` — rebuild the native `serialport` module after any Electron/Node version change.
- `npm run dist:win` / `npm run dist:mac` — platform installers; `npm run pack` for an unpacked dir build.

There is no linter configured. Tests are Node-environment Vitest under `test/**/*.test.ts`.

## Path aliases

`@/` → `src/`, `@shared/` → `shared/`. Configured identically in `electron.vite.config.ts` (renderer), `vitest.config.ts`, and `tsconfig.json`. `shared/` (repo root) holds cross-process types/IPC contracts; `src/shared/` holds renderer-only shared code (IPC client wrapper, zustand stores) — do not confuse the two.

## Three-process architecture

electron-vite builds three separate bundles:

- **Main** (`electron/main.ts`) — single large file owning all `ipcMain` handlers: serial ports, TCP client/server, TCP-share, virtual-port pairs (loopback TCP relays), config/commands persistence (to `app.getPath('userData')`), popout windows, the auto-updater, and the **script sandbox runner** (`scripts:run` executes generated code via `node:vm` with an injected sandbox of helpers; `electron/scriptSandbox.ts` provides the pure helpers — CRC, encoding, byte ops). Native serial data is base64-encoded over IPC.
- **Preload** (`electron/preload.ts`) — implements the `WindowAPI` interface from `shared/types.ts` and exposes it as `window.api` via `contextBridge`. Every IPC channel is wired here; preload also decodes base64 payloads back to `Uint8Array`.
- **Renderer** — three HTML entry points in `src/`: `index.html` (main window), `panel.html` (popout serial panels), `changelog.html`. Each has its own `createRoot`.

Renderer code reaches the main process **only** through `getIPC()` / `useIPC()` (`src/shared/ipc/index.ts`), which return the typed `window.api`. When adding an IPC channel: add the handler in `main.ts`, wire it in `preload.ts`, and add its type to `WindowAPI` in `shared/types.ts`.

## Dual-track legacy/React coexistence

This is the most important thing to understand before editing the renderer. `index.html` simultaneously hosts:

1. The **legacy app** — a full vanilla-JS DOM tree (`#app`, settings/command/script dialogs) driven by root-level `renderer.js` (~6200 lines) plus `src/*.js` (`code-generator.js`, `flow-editor.js`, `node-definitions.js`, `mock-api.js`, `panel.js`). These are plain `<script>` tags, not built by Vite.
2. The **React app** — mounted at `#root` (a fixed, full-viewport, `pointer-events:none` overlay) via `src/main.tsx`.

`src/shared/store/flags.ts` (zustand) decides which subsystems React owns. Currently `useReactScriptEditor: true` (Phase 1 done), everything else false → still legacy. The two tracks must never both bind the same IPC channel at once; the feature flag is the hard boundary. Legacy code is deleted phase-by-phase as React takes over, per the migration roadmap.

The React script editor is opened by the legacy side dispatching the `saecom:open-react-script-editor` window event (or calling `window.openReactScriptEditor`). Cross-track data (e.g. serial panel summaries, active panel id) is read from globals the legacy side installs on `window` (e.g. `window.getSerialPanelSummaries`).

## Script editor (Phase 1, the active React subsystem)

Lives in `src/features/script-editor/`. A visual node-graph editor (Rete.js v2) that compiles a graph to JavaScript, which the main process runs in its sandbox.

- **Graph editing**: `rete/setup.ts` builds the Rete `NodeEditor` + area/connection/dock/auto-arrange plugins with React node rendering. `rete/graphState.ts` is the plain serializable state (add/duplicate/import/export). Four socket kinds (`rete/types.ts`, `nodes/sockets.ts`): `dataSocket` (weakly typed, default), `boolSocket`, `flowSocket`, `triggerSocket`. `control-if` conditions only accept `boolSocket` — that constraint is enforced via `canConnectSockets`.
- **Node definitions**: `nodes/definitions.ts` is the single source of truth (`NodeDef`: key, category, name, inputs/outputs, controls). This deliberately replaces the legacy double-write between `node-definitions.js` and `code-generator.js`.
- **Codegen** (`codegen/`): `index.ts` topologically sorts the graph (`topo.ts`) and emits a `try{…}catch` block. Emitters are **dispatched by node `key`/category** via `registry.ts` → `emit/*.ts` (input/transform/control/compare/logical/output), never by display name (the legacy bug this rewrite fixed). `context.ts` carries `varMap`/`processedNodes`.
- **Persistence** (`persistence.ts`): scripts are `.js` files (in userData `scripts/`) embedding the Rete export between `VS_FLOW_START`/`VS_FLOW_END` markers, followed by generated code. No legacy-format (Drawflow) compatibility.
- **UI state**: `uiState.ts` and `viewModel.ts` are pure functions (drawer/palette/tool state transitions, position math, option building) kept separate from components specifically so they can be unit-tested without rendering — mirror this when adding behavior (see `test/script-editor-*.test.ts`).

When changing codegen or node behavior, update/add a Vitest case; `test/rete-codegen.test.ts` and `test/code-generator.test.ts` are the regression baseline the rewrite preserved.

## Conventions

- New code is TypeScript/TSX; leave legacy JS stable unless migrating it. Newer files use 2-space indent and omit semicolons.
- React components PascalCase; hooks/utilities camelCase; tests `*.test.ts`.
- **E2E gate**: user-visible UI features must be covered by a Playwright spec in `e2e/` before being considered done. Run `npm run test:e2e:build` and confirm green; UI work without a matching E2E spec is incomplete. See `AGENTS.md` "E2E (Playwright Electron)" for scope and selector guidance.
- Commits follow Conventional Commits with a phase scope, e.g. `feat(phase1): …`, `fix(phase0): …`.
- shadcn/ui components live in `src/components/ui/`; styling is Tailwind (`tailwind.config.ts`, dark mode via `class`).
- Do not commit device data, serial logs, generated installers, or `dist/`/`out/`. Keep `package-lock.json` reproducible and rebuild `serialport` after dependency/Electron upgrades.
