import { registerRouter, type InvokeRoutes, type SendRoutes } from '../core/ipc'
import type { AppService } from '../services/app.service'

/**
 * AppRouter —— 应用元信息 / 更新 / changelog / about 内容 域的 IPC 注册。
 *
 * 通道名零变化：
 * - app:version（invoke）/ app:checkUpdate（send）
 * - changelog:request（send，reply changelog:content）
 * - about:request（send，reply about:content）
 *
 * 以下通道暂不迁移（留在 main.ts，组3 随 WindowService 处理）：
 * - theme:set —— 触发 applyTitleBarOverlay（遍历窗口），窗口域
 * - changelog:open / about:open —— 创建 BrowserWindow，窗口域
 */
export function registerAppRouter(service: AppService): void {
  const appInvoke: InvokeRoutes = {
    version: () => service.getVersion()
  }
  const appSend: SendRoutes = {
    checkUpdate: () => service.checkUpdate()
  }

  const changelogSend: SendRoutes = {
    request: (event) => service.sendChangelogContent(event)
  }

  const aboutSend: SendRoutes = {
    request: (event) => event.reply('about:content', service.getAboutInfo())
  }

  registerRouter({ namespace: 'app', invoke: appInvoke, send: appSend })
  registerRouter({ namespace: 'changelog', send: changelogSend })
  registerRouter({ namespace: 'about', send: aboutSend })
}
