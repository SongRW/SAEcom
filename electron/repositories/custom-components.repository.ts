import fs from 'node:fs'
import path from 'node:path'
import { app, dialog } from 'electron'
import type {
  CustomComponentExportPayload, CustomComponentImportResult, CustomComponentImportSummary
} from '../../shared/types'

/**
 * 自定义组件持久化仓库（userData/script-components/*.json）。
 *
 * 文件格式：每个 .json 是一个 UserComponentDescriptor | CompositeComponentDescriptor（裸描述符，
 * 非 .sccom 封装）。.sccom 仅用于导入导出（分发），含格式头。
 *
 * 行为对齐 scripts.repository.ts 的模式（safeName 防穿越、重名兜底、export/import dialog）。
 */
const SCCOM_EXT = '.sccom'
const SCCOM_FORMAT = 'saecom-component'
const SCCOM_FORMAT_VERSION = 1

export class CustomComponentsRepository {
  private readonly dir: string

  constructor(userDataDir?: string) {
    this.dir = path.join(userDataDir ?? app.getPath('userData'), 'script-components')
  }

  getDir(): string {
    return this.dir
  }

  ensureDir(): void {
    try { fs.mkdirSync(this.dir, { recursive: true }) } catch { /* ignore */ }
  }

  /** 安全化组件文件名：剥离路径分隔符 + Windows 非法字符；强制 .json 扩展名。 */
  safeName(name: string): string {
    let n = String(name || '').trim().replace(/[/\\<>:"|?*]/g, '').replace(/[\x00-\x1f]/g, '')
    if (!n || n === '.' || n === '..') n = 'component'
    // 允许 .json（本地存储）。.sccom 仅导入导出用，不入库。
    if (!n.endsWith('.json')) n += '.json'
    return n
  }

  list(): string[] {
    this.ensureDir()
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
  }

  read(name: string): string {
    const f = path.join(this.dir, this.safeName(name))
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : ''
  }

  write(name: string, content: string): { ok: boolean; error?: string } {
    this.ensureDir()
    try {
      fs.writeFileSync(path.join(this.dir, this.safeName(name)), String(content ?? ''), 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  delete(name: string): { ok: boolean; error?: string } {
    const f = path.join(this.dir, this.safeName(name))
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch (e: any) { return { ok: false, error: String(e?.message || e) } }
    }
    return { ok: true }
  }

  /**
   * 重命名组件：改名文件并同步改写 descriptor.key，保证 key 与文件名永不脱同步。
   *
   * 回归：此前仅 fs.renameSync 改名文件，文件内 key 不变 → 下次编辑保存时
   * newFileName 按旧 key 推导，重命名被静默回滚（且可能误删新文件）。
   * 新 key 必须形如 custom-xxx；否则拒绝并提示，避免写入非法 key。
   */
  rename(oldName: string, newName: string, newKey?: string): { ok: boolean; error?: string } {
    this.ensureDir()
    const old = path.join(this.dir, this.safeName(oldName))
    const next = path.join(this.dir, this.safeName(newName))
    if (!fs.existsSync(old)) return { ok: false, error: '源组件不存在' }
    if (old === next && !newKey) return { ok: true }
    if (fs.existsSync(next) && old !== next) return { ok: false, error: '目标名称已存在' }
    // 目标文件名（新 key）必须与内容 key 一致；非法 key 直接拒绝
    if (newKey && !/^custom-[a-z0-9-]+$/.test(newKey)) {
      return { ok: false, error: "新 key 必须形如 'custom-xxx'（小写字母/数字/连字符）" }
    }
    try {
      // 同步改写内容 key：先读旧文件，更新 key 后写入新文件名，再删除旧文件
      const raw = fs.readFileSync(old, 'utf-8')
      const descriptor = JSON.parse(raw) as Record<string, unknown>
      if (newKey) descriptor.key = newKey
      fs.writeFileSync(next, JSON.stringify(descriptor, null, 2), 'utf-8')
      if (old !== next) fs.unlinkSync(old)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  /** 导出单个组件为 .sccom（含格式头）。 */
  async exportComponent(name: string): Promise<{ ok: boolean; canceled?: boolean; error?: string; filePath?: string }> {
    const jsonPath = path.join(this.dir, this.safeName(name))
    if (!fs.existsSync(jsonPath)) return { ok: false, error: '组件不存在' }
    let descriptor: Record<string, unknown>
    try {
      descriptor = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    } catch (e: any) {
      return { ok: false, error: '组件文件解析失败: ' + String(e?.message || e) }
    }
    const kind = inferKind(descriptor)
    // 组合组件（C 层已开放：子画布编辑器 + 注册链路）现在支持导出，
    // 与 JS 组件共享同一 .sccom 封装（kind 字段区分），导入侧按 subgraph 字段识别。
    const payload: CustomComponentExportPayload = {
      format: SCCOM_FORMAT,
      formatVersion: SCCOM_FORMAT_VERSION,
      kind,
      descriptor,
      exportedAt: new Date().toISOString(),
      exportedFrom: `SAEcom ${app.getVersion()}`
    }
    const defaultPath = String(name || '').replace(/\.json$/i, '')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出自定义组件',
      defaultPath,
      filters: [{ name: 'SAEcom 组件', extensions: ['sccom'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { ok: true, filePath }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  /**
   * 导入一个或多个 .sccom（多选）。逐个：解析格式头 → 校验 formatVersion → 写入（重名兜底）。
   * 非法文件（格式头缺失/版本不支持/描述符非法）进 rejected，不阻断其余。
   * 注意：描述符的业务校验（key/端口/sandboxApis/emit）在 renderer 侧经 validateUserDescriptor
   * 做最终把关（加载到注册表前）；此处仅做格式层校验，保持仓库与渲染层解耦。
   */
  async importComponents(): Promise<{ ok: boolean; canceled?: boolean; summary?: CustomComponentImportSummary }> {
    this.ensureDir()
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入自定义组件',
      properties: ['multiSelections', 'openFile'],
      filters: [{ name: 'SAEcom 组件', extensions: ['sccom'] }]
    })
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

    const imported: CustomComponentImportResult[] = []
    const rejected: Array<{ name: string; error: string }> = []

    for (const src of filePaths) {
      const baseName = path.basename(src)
      let payload: CustomComponentExportPayload
      try {
        payload = JSON.parse(fs.readFileSync(src, 'utf-8'))
      } catch (e: any) {
        rejected.push({ name: baseName, error: '文件解析失败: ' + String(e?.message || e) })
        continue
      }
      if (!payload || payload.format !== SCCOM_FORMAT) {
        rejected.push({ name: baseName, error: '不是合法的 SAEcom 组件文件（缺少格式头）' })
        continue
      }
      if (typeof payload.formatVersion !== 'number' || payload.formatVersion > SCCOM_FORMAT_VERSION) {
        rejected.push({ name: baseName, error: `不支持的组件格式版本 ${payload.formatVersion}（当前支持 ≤ ${SCCOM_FORMAT_VERSION}）` })
        continue
      }
      if (!payload.descriptor || typeof payload.descriptor !== 'object') {
        rejected.push({ name: baseName, error: '组件描述符缺失' })
        continue
      }
      // 组合组件（C 层已开放）按 subgraph 字段识别，与 JS 组件共用导入路径。
      // 加载侧 loadCustomComponents 会按 subgraph 字段分流到 CompositeNodeComponent。
      // 用 descriptor.key 推导目标文件名（key 形如 custom-xxx → custom-xxx.json）
      const key = String((payload.descriptor as { key?: unknown }).key || '')
      const targetBase = key ? `${key}.json` : baseName.replace(/\.sccom$/i, '.json')
      const finalName = this.findAvailableName(targetBase)
      const dest = path.join(this.dir, this.safeName(finalName))
      try {
        // flag:wx 防覆盖（findAvailableName 已兜底，双保险）
        fs.writeFileSync(dest, JSON.stringify(payload.descriptor, null, 2), { encoding: 'utf-8', flag: 'wx' })
        imported.push({ ok: true, name: finalName })
      } catch (e: any) {
        rejected.push({ name: baseName, error: String(e?.message || e) })
      }
    }

    return { ok: true, summary: { imported, rejected } }
  }

  /** 重名兜底：Foo.json → Foo (1).json（对齐 scriptImport.ts 模式）。 */
  private findAvailableName(sourceName: string): string {
    const normalized = this.safeName(sourceName)
    const existing = new Set(this.list().map((n) => n.toLowerCase()))
    if (!existing.has(normalized.toLowerCase())) return normalized
    const base = normalized.replace(/\.json$/i, '')
    let i = 1
    while (existing.has(`${base} (${i}).json`.toLowerCase())) i++
    return `${base} (${i}).json`
  }
}

/** 从描述符推断 kind（composite 有 subgraph，否则 js）。 */
function inferKind(descriptor: Record<string, unknown>): 'js' | 'composite' {
  return 'subgraph' in descriptor ? 'composite' : 'js'
}
