# Repository Guidelines

## Project Structure & Module Organization

SAEcom is an Electron serial-port assistant with a fully React-based renderer. Electron process entry points live in `electron/main.ts` and `electron/preload.ts`. The React renderer lives under `src/`: each Electron window has an entry pair under `src/app/` (`mainwindow`/`panel`/`script-editor`/`changelog`/`about` `.tsx` + `.html`); feature modules live under `src/features/<feature>/`; shared renderer state in `src/shared/store/`, IPC helpers in `src/shared/ipc/`, utilities in `src/shared/lib/` and `src/shared/hooks/`; reusable shadcn UI primitives in `src/components/ui/`; the web-preview `window.api` shim is `src/shared/dev/mock-api.ts`. Cross-process types and IPC contracts live in `shared/`. Tests are in `test/`; assets are in `build/`. Path aliases: `@/` → `src/`, `@shared/` → `shared/`.

## Build, Test, and Development Commands

> **Prerequisites**: Node.js 20 (see `.nvmrc`). A C++ toolchain for the native `@serialport/bindings-cpp` module is **usually not required** — it ships N-API prebuilt binaries that match Electron's ABI. You only need one (Windows: VS Build Tools 2022 with the "Desktop development with C++" workload + Python 3; macOS: `xcode-select --install`; Linux: `python3 make g++`) if you hit a native-module load error and must recompile via `npm run rebuild`. See the "从源码构建" section of `README.MD`.

- `npm run dev`: start the Electron/Vite development workflow through `scripts/dev.js`.
- `npm run build`: build main, preload, and renderer bundles with `electron-vite`.
- `npm run typecheck`: run TypeScript checks for app and node configs.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run Playwright Electron E2E tests (requires `npm run build` first).
- `npm run test:e2e:build`: build then run E2E — the recommended one-shot command.
- `npm run typecheck:e2e`: typecheck the `e2e/` specs via `tsconfig.e2e.json`.
- `npm run pack`: build and create an unpacked Electron app in `dist/`.
- `npm run dist:win` / `npm run dist:mac`: create platform installers.
- `npm run rebuild`: rebuild the native `serialport` dependency after Electron or Node changes.

## Coding Style & Naming Conventions

Use TypeScript/TSX for all Electron, React, shared, and UI code. The codebase uses two-space indentation in TS/TSX and semicolon-free style. Prefer path aliases already configured in Vite/Vitest: `@/` for `src/` and `@shared/` for `shared/`. React components use PascalCase; hooks and utilities use camelCase; tests use `*.test.ts`.

The shadcn/ui primitives live in `src/components/ui/` and follow the custom preset declared in `components.json` (style `radix-nova`, baseColor `mist`, menu `default-translucent`, icon library `phosphor`). Running `shadcn add` regenerates under these presets — re-apply any local customizations afterward. The `cn()` helper is imported from `@/shared/lib/utils` (not shadcn's default `@/lib/utils`).

## Testing Guidelines

Vitest is configured for Node tests under `test/**/*.test.ts`. Add focused tests when changing code generation, IPC contracts, or shared logic. Document any manual Electron verification in the pull request.

### E2E (Playwright Electron)

User-visible UI features must be covered by a Playwright E2E spec in `e2e/` before the work is considered done. This is a hard gate, not a suggestion:

- **Scope**: any change with a user-visible UI effect — new panels, buttons, dialogs, interactions, multi-window flows, or UI bug fixes. Pure internal refactors, utility functions, and non-UI logic may stay on Vitest alone.
- **What to add**: a new `*.spec.ts` under `e2e/`, or extend an existing spec. Reuse the fixtures in `e2e/fixtures.ts` (app launch, isolated `userData`, multi-window helpers) and the TCP echo server in `e2e/helpers/` rather than re-rolling setup.
- **Selectors**: the codebase has almost no `data-testid` (only Rete nodes have some). Prefer visible text → `title` attributes → role/dialog structure. When a selector would be fragile, add a focused `data-testid` to the component under test.
- **Verify before claiming done**: run `npm run test:e2e:build` and confirm every spec passes; report the output honestly. UI work with no matching E2E spec counts as incomplete.

Run `npm test`, `npm run typecheck`, and (for UI changes) `npm run test:e2e:build` before submitting changes.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commits, often with a scope: `feat(phase0): ...`, `fix(phase0): ...`, `chore: ...`. Keep commits narrow and describe user-visible behavior. Pull requests should include a summary, test results, linked issues when available, and screenshots or recordings for UI changes. For UI changes, the PR must reference the E2E spec that covers the new behavior (or explain why none is needed). Call out impacts on serialport packaging or native rebuilds.

### Repository Ownership (core convention)

This project has **diverged too far architecturally** from upstream `tylhk/SAEcom`. There is **no longer any value in opening PRs back to `origin` (`tylhk/SAEcom`)**, and you must not do so. The canonical remote for this fork is `songrw` (`SongRW/SAEcom`):

- All work, commits, tags, and release branches go to **`songrw`** only.
- Never push to `origin` / never open PRs to `tylhk/SAEcom`.
- Treat `songrw/develop_srw` (and `songrw/main`) as the source of truth. The `origin` remote is retained purely for occasional upstream-reference pulls if ever needed; do not treat it as a push/PR target.

## Security & Configuration Tips

Do not commit local device data, serial-port logs, generated installers, or build outputs from `dist/` and `out/`. Keep native module changes reproducible with `package-lock.json`, and rebuild `serialport` after dependency or Electron upgrades.
