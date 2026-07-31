import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildScriptFile, parseScriptFile } from '../src/features/script-editor/persistence'
import { waitForAppReady } from './fixtures'

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js')
const SAMPLE_NAME = '复杂协议v2-可视化.js'

test.describe('内置可视化脚本保存', () => {
  test('修改内置样例后重启应用仍保留图形节点', async () => {
    test.setTimeout(120000)
    const userData = mkdtempSync(join(tmpdir(), 'saecom-sample-restart-'))
    let app: Awaited<ReturnType<typeof electron.launch>> | null = null

    try {
      app = await electron.launch({
        args: [MAIN_ENTRY],
        env: {
          ...process.env,
          SAECOM_FORCE_PROD: '1',
          SAECOM_USER_DATA: userData,
          SAECOM_E2E: '1'
        }
      })
      let page = await app.firstWindow()
      await waitForAppReady(page)

      const saved = await page.evaluate(async (name) => (window as any).api.scripts.read(name), SAMPLE_NAME)
      const parsed = parseScriptFile(saved)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      const graph = JSON.parse(JSON.stringify(parsed.graph))
      graph.nodes.push({
        id: 'restart-log',
        key: 'output-log',
        label: '重启后保留日志',
        position: { x: 1920, y: 40 },
        data: { level: 'info', prefix: 'RESTART_PERSIST' }
      })
      await page.evaluate(async ({ name, content }) => (window as any).api.scripts.write(name, content), {
        name: SAMPLE_NAME,
        content: buildScriptFile(graph, parsed.code)
      })

      await app.close()
      app = await electron.launch({
        args: [MAIN_ENTRY],
        env: {
          ...process.env,
          SAECOM_FORCE_PROD: '1',
          SAECOM_USER_DATA: userData,
          SAECOM_E2E: '1'
        }
      })
      page = await app.firstWindow()
      await waitForAppReady(page)

      const restored = await page.evaluate(async (name) => (window as any).api.scripts.read(name), SAMPLE_NAME)
      const restoredGraph = parseScriptFile(restored)
      expect(restoredGraph.ok).toBe(true)
      if (!restoredGraph.ok) return
      const nodes = Array.isArray(restoredGraph.graph.nodes)
        ? restoredGraph.graph.nodes
        : Object.values(restoredGraph.graph.nodes)
      expect(nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'restart-log', key: 'output-log' })
      ]))
    } finally {
      if (app) await app.close()
      try {
        rmSync(userData, { recursive: true, force: true })
      } catch {
        /* Windows may release Electron file handles asynchronously. */
      }
    }
  })
})
