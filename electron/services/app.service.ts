import { app, type IpcMainEvent } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * AppService —— 应用元信息 / 更新触发 / changelog / about 内容 域。
 *
 * 行为逐函数对照搬移自 main.ts，零变化：
 * - app:version（main.ts:970）
 * - app:checkUpdate（main.ts:999-1001）—— 仅触发，更新 UI 逻辑留在 main.ts（注入回调）
 * - changelog:request（main.ts:989-998）
 * - about:request（main.ts:1020-1029）
 *
 * 注意：changelog:open / about:open 会创建 BrowserWindow，属窗口域 → 留在 main.ts，
 * 组3（WindowService）迁移。theme:set 触发 applyTitleBarOverlay（窗口域）同理留在 main.ts。
 */
export class AppService {
  /**
   * 更新检查回调。checkForUpdates 含 dialog/下载/安装 UI，与窗口强耦合，
   * 由 main.ts 注入（main.ts 持 mainWindow + 更新流程）。
   * 默认 no-op，保持 AppService 纯净可测。
   */
  private updateChecker: (isManual: boolean) => void = () => {}

  /** 注入更新检查实现（main.ts 装配时调用）。 */
  setUpdateChecker(fn: (isManual: boolean) => void): void {
    this.updateChecker = fn
  }

  /** app:version */
  getVersion(): string {
    return app.getVersion()
  }

  /** app:checkUpdate —— 触发手动检查（isManual=true）。 */
  checkUpdate(): void {
    this.updateChecker(true)
  }

  /**
   * changelog:request —— 异步读 CHANGELOG.md，经 event.reply 回送。
   * 与原实现一致：读失败回送加载失败提示，不 reject。
   */
  sendChangelogContent(event: IpcMainEvent): void {
    const mdPath = path.join(__dirname, '../..', 'CHANGELOG.md')
    fs.readFile(mdPath, 'utf-8', (err, data) => {
      if (err) {
        event.reply('changelog:content', '# 加载失败\n无法读取 CHANGELOG.md 文件。')
      } else {
        event.reply('changelog:content', data)
      }
    })
  }

  /** about:request —— 同步回送版本/平台信息。 */
  getAboutInfo(): {
    version: string
    electron: string
    chrome: string
    node: string
    platform: NodeJS.Platform
    arch: string
  } {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    }
  }
}
