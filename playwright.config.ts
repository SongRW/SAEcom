import { defineConfig } from '@playwright/test'

/**
 * Playwright Electron E2E 配置。
 *
 * 启动方式：build 产物 + 主进程 env 钩子。
 * 测试前必须先 `npm run build`（产出 out/main + out/renderer）；缺失时 globalSetup 会报错提示。
 * 各 spec 通过 e2e/fixtures.ts 的 `electronApp` 夹具启动各自独立的 Electron 实例，
 * 并以临时目录隔离 userData，互不污染、互不依赖。
 */
export default defineConfig({
  testDir: './e2e',
  // spec 与 vitest 的 *.test.ts 天然隔离；这里只扫 *.spec.ts
  testMatch: /.*\.spec\.ts$/,
  // Electron 测试共享图形会话，串行更稳
  fullyParallel: false,
  workers: 1,
  // 多窗口 / Rete 画布交互偶有延迟，放宽整体上限
  globalTimeout: 5 * 60 * 1000,
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    actionTimeout: 15 * 1000,
    navigationTimeout: 15 * 1000,
    trace: 'on-first-retry'
  },
  globalSetup: require('path').resolve(__dirname, 'e2e/global-setup.ts')
})
