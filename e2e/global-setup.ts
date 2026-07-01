import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Playwright globalSetup：确保 build 产物存在。
 * 启动方式为「build 产物 + env 钩子」，缺 out/main 或 out/renderer 时提前失败并提示。
 */
export default async function globalSetup() {
  const mainEntry = resolve(__dirname, '../out/main/index.js')
  const rendererDir = resolve(__dirname, '../out/renderer')
  if (!existsSync(mainEntry) || !existsSync(rendererDir)) {
    throw new Error(
      `\n[Playwright] 缺少构建产物：\n  ${mainEntry}\n  ${rendererDir}\n\n` +
        '请先运行 `npm run build`（或 `npm run test:e2e:build`）再执行 E2E。\n'
    )
  }
}
