import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { seedSampleScripts } from '../sampleScripts'
import { importScriptFile } from '../scriptImport'

/**
 * ScriptsRepository —— 脚本文件 CRUD + 示例脚本播种 + 导入/导出。
 *
 * 持有 scriptsDir（userData/scripts）。行为逐函数对照搬移自 main.ts，零变化：
 * - scripts:dir / list / read / write / delete / rename（main.ts:279-305）
 * - scripts:export / import（main.ts:306-328，含 dialog）
 * - ensureScriptsDir / safeScriptName / resolveSampleScriptsDir / seedBundledSampleScripts（main.ts:123-154）
 *
 * 状态私有化：scriptsDir 挂在实例（不再模块顶层）。
 * 不持 IPC：router 调用本仓库方法并返回。
 */
export class ScriptsRepository {
  private readonly scriptsDir: string

  constructor() {
    this.scriptsDir = path.join(app.getPath('userData'), 'scripts')
  }

  getDir(): string {
    return this.scriptsDir
  }

  ensureDir(): void {
    try { fs.mkdirSync(this.scriptsDir, { recursive: true }) } catch { }
  }

  safeScriptName(name: string): string {
    name = String(name || '').trim().replace(/[/\\]/g, '')
    // 数据文件(.txt)保留原名；脚本文件(.js)确保扩展名
    if (!name.endsWith('.js') && !name.endsWith('.txt')) name += '.js'
    return name
  }

  list(): string[] {
    this.ensureDir()
    return fs.readdirSync(this.scriptsDir).filter(f => f.endsWith('.js'))
  }

  read(name: string): string {
    const f = path.join(this.scriptsDir, this.safeScriptName(name))
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : ''
  }

  write(name: string, content: unknown): { ok: true } | { ok: false; error: string } {
    this.ensureDir()
    try {
      fs.writeFileSync(path.join(this.scriptsDir, this.safeScriptName(name)), String(content ?? ''), 'utf-8')
      return { ok: true }
    } catch (e: any) {
      console.error('Script save failed:', e)
      return { ok: false, error: e.message }
    }
  }

  delete(name: string): { ok: true } {
    const f = path.join(this.scriptsDir, this.safeScriptName(name))
    if (fs.existsSync(f)) fs.unlinkSync(f)
    return { ok: true }
  }

  rename(oldName: string, newName: string): { ok: true } | { ok: false; error: string } {
    this.ensureDir()
    const old = path.join(this.scriptsDir, this.safeScriptName(oldName))
    const next = path.join(this.scriptsDir, this.safeScriptName(newName))
    if (!fs.existsSync(old)) return { ok: false, error: '源脚本不存在' }
    if (old === next) return { ok: true }
    // 仅大小写差异（如 Script_1.js → SCRIPT_1.js）：区分大小写的 FS 上是合法改名，
    // 大小写不敏感的 FS（Windows/macOS 默认）上是 no-op；两种情况都应放行而非判为重名。
    const caseOnly = old.toLowerCase() === next.toLowerCase()
    if (!caseOnly && fs.existsSync(next)) return { ok: false, error: '该名称已存在' }
    try { fs.renameSync(old, next); return { ok: true } }
    catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
  }

  async exportScript(name: string): Promise<{ ok: true; filePath: string } | { ok: false; error: string; canceled?: boolean }> {
    const src = path.join(this.scriptsDir, this.safeScriptName(name))
    if (!fs.existsSync(src)) return { ok: false, error: '脚本不存在' }
    const content = fs.readFileSync(src, 'utf-8')
    const defaultPath = String(name || '').replace(/\.js$/i, '')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出脚本',
      defaultPath,
      filters: [{ name: 'JavaScript', extensions: ['js'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true, error: 'canceled' }
    try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } }
    catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
  }

  async importScript(): Promise<{ ok: true; name: string } | { ok: false; error: string; canceled?: boolean }> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入脚本',
      properties: ['openFile'],
      filters: [{ name: 'JavaScript', extensions: ['js'] }]
    })
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true, error: 'canceled' }
    return importScriptFile(filePaths[0], this.scriptsDir)
  }

  /** 内置示例脚本源目录：dev/e2e 走仓库 shared/samples；打包后走 asar 内同路径。 */
  resolveSampleScriptsDir(): string | null {
    const candidates = [
      path.join(__dirname, '../../shared/samples'),
      path.join(app.getAppPath(), 'shared/samples'),
      path.join(process.resourcesPath || '', 'shared/samples')
    ]
    for (const dir of candidates) {
      try {
        if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
      } catch { /* ignore */ }
    }
    return null
  }

  seedBundledSampleScripts(): void {
    const sampleDir = this.resolveSampleScriptsDir()
    if (!sampleDir) return
    seedSampleScripts({
      sampleDir,
      scriptsDir: this.scriptsDir,
      statePath: path.join(app.getPath('userData'), 'sample-scripts.json')
    })
  }
}
