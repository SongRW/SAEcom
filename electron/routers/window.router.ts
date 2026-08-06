import { registerRouter, type InvokeRoutes, type SendRoutes } from '../core/ipc'
import type { WindowService } from '../services/window.service'

/**
 * WindowRouter —— 多窗口生命周期 + 主题 + 弹出窗 域的 IPC 注册。
 *
 * 通道名零变化，按 preload 命名空间分组注册：
 * - window:*（控制类：fullscreen/minimize/maximize/close/platform/isMaximized/subscribeMaximize/focus/set-oscilloscope-top）
 * - theme:set
 * - changelog:open / about:open（send，建窗）
 * - panel:*（request-hide/saveLog/popout/set-always-on-top/request-dock）
 * - scriptEditor:*（popout invoke / request-dock send）—— preload 命名空间为 scriptEditor，通道 script-editor:*
 * - scriptOutput:*（popout/sync invoke；request-close/clear/payload send）—— 通道 script-output:*
 *
 * 注意：通道名用连字符（script-editor/script-output），preload invoke/send 已对齐。
 */
export function registerWindowRouter(service: WindowService): void {
  const windowInvoke: InvokeRoutes = {
    platform: () => service.platform(),
    isMaximized: (e) => service.isMaximized(e)
  }
  const windowSend: SendRoutes = {
    'set-fullscreen': (_e, { flag }) => service.setFullscreen(flag),
    'toggle-fullscreen': () => service.toggleFullscreen(),
    focus: () => service.focus(),
    minimize: (e) => service.minimize(e),
    toggleMaximize: (e) => service.toggleMaximize(e),
    close: (e) => service.close(e),
    subscribeMaximize: (e) => service.subscribeMaximize(e),
    'set-oscilloscope-top': (_e, { flag }) => service.setOscilloscopeTop(flag)
  }

  const themeSend: SendRoutes = {
    set: (_e, { dark }) => service.setTheme(dark)
  }

  const changelogSend: SendRoutes = { open: () => service.openChangelog() }
  const aboutSend: SendRoutes = { open: () => service.openAbout() }

  const panelInvoke: InvokeRoutes = {
    saveLog: (_e, { name, content }) => service.savePanelLog(name, content),
    popout: (_e, args) => service.popoutPanel(args)
  }
  const panelSend: SendRoutes = {
    'request-hide': (e, { id }) => service.requestHidePanel(e, id),
    'set-always-on-top': (_e, { id, onTop }) => service.setPanelAlwaysOnTop(id, onTop),
    'request-dock': (_e, { id, html }) => service.requestDockPanel(id, html)
  }

  const scriptEditorInvoke: InvokeRoutes = {
    popout: (_e, { graphStr, activeScriptName }) => service.popoutScriptEditor(graphStr, activeScriptName)
  }
  // 通道 script-editor:request-dock / request-payload（send）
  const scriptEditorSend: SendRoutes = {
    'request-dock': (_e, payload) => service.requestDockScriptEditor(payload),
    // 弹窗侧首包兜底：did-finish-load 推送可能早于 React effect 订阅，弹窗主动拉取一次
    'request-payload': (e) => service.requestPayloadScriptEditor(e)
  }

  const scriptOutputInvoke: InvokeRoutes = {
    popout: (_e, payload) => service.popoutScriptOutput(payload)
  }
  // script-output:sync 既可 invoke 也可 send（preload 用 send）；request-close/clear/payload 用 send
  const scriptOutputSend: SendRoutes = {
    sync: (_e, payload) => service.syncScriptOutput(payload),
    'request-close': () => service.requestCloseScriptOutput(),
    'request-clear': () => service.requestClearScriptOutput(),
    'request-payload': (e) => service.requestPayloadScriptOutput(e)
  }

  registerRouter({ namespace: 'window', invoke: windowInvoke, send: windowSend })
  registerRouter({ namespace: 'theme', send: themeSend })
  registerRouter({ namespace: 'changelog', send: changelogSend })
  registerRouter({ namespace: 'about', send: aboutSend })
  registerRouter({ namespace: 'panel', invoke: panelInvoke, send: panelSend })
  // 通道名带连字符，registerRouter 拼接 `${namespace}:${method}` → 'script-editor:popout' 等
  registerRouter({ namespace: 'script-editor', invoke: scriptEditorInvoke, send: scriptEditorSend })
  registerRouter({ namespace: 'script-output', invoke: scriptOutputInvoke, send: scriptOutputSend })
}
