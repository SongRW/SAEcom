import { registerRouter, type InvokeRoutes, type SendRoutes } from '../core/ipc'
import type { ConfigService } from '../services/config.service'

/**
 * ConfigRouter —— 配置 / 命令 / 文件 / 日志 域的 IPC 注册。
 *
 * 通道名零变化（config:load / config:save / commands:load / commands:save /
 * commands:flush / file:readHex / file:pickOpen / logger:append / logger:pickFile）。
 * 不持状态：仅校验入参 + 调 ConfigService。
 *
 * 注意：config 与 file/logger 在 preload 是三个命名空间（config/file/logger），
 * 但属同一 ConfigService。这里按 preload 命名空间分三次注册，保持通道前缀对齐。
 */
export function registerConfigRouter(service: ConfigService): void {
  const configInvoke: InvokeRoutes = {
    load: () => service.loadPanelsConfig()
  }
  const configSend: SendRoutes = {
    save: (_e, panels) => service.savePanelsConfig(panels)
  }

  const commandsInvoke: InvokeRoutes = {
    load: () => service.loadCommandsConfig(),
    flush: () => service.flushCommands()
  }
  const commandsSend: SendRoutes = {
    save: (_e, cmds) => service.saveCommandsConfig(cmds)
  }

  const fileInvoke: InvokeRoutes = {
    readHex: (_e, filePath: string) => service.readHex(filePath),
    pickOpen: () => service.pickOpenFile()
  }

  const loggerInvoke: InvokeRoutes = {
    append: (_e, filePath: string, text: string) => service.appendLog(filePath, text),
    pickFile: () => service.pickLogFile()
  }

  registerRouter({ namespace: 'config', invoke: configInvoke, send: configSend })
  registerRouter({ namespace: 'commands', invoke: commandsInvoke, send: commandsSend })
  registerRouter({ namespace: 'file', invoke: fileInvoke })
  registerRouter({ namespace: 'logger', invoke: loggerInvoke })
}
