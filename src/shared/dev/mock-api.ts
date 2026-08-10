import type { WindowAPI } from '@shared/types'

/**
 * Web 预览安全网：非 Electron 环境下注入 window.api shim。
 * 仅用于浏览器静态预览，stub 数据近似、不追求与 IPC 契约逐字段对齐，
 * 故整体 as WindowAPI 放宽类型（真实 preload/main.ts 均严格类型检查）。
 */
;(function installWebPreviewApiMock() {
  if (window.api) return

  const noop = () => {}
  const asyncOk = async () => ({ ok: true })
  const emptyUnsubscribe = () => {}
  const panelConfigs = [
    {
      id: 'COM3',
      title: '主串口',
      path: 'COM3',
      type: 'serial',
      isOpen: true,
      hidden: false,
      options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' }
    },
    {
      id: 'tcp://127.0.0.1:502',
      title: 'PLC',
      path: 'tcp://127.0.0.1:502',
      type: 'tcp',
      isOpen: false,
      hidden: false,
      host: '127.0.0.1',
      port: 502
    }
  ]

  window.api = {
    serial: {
      list: async () => [
        { path: 'COM3', manufacturer: 'Web Preview' },
        { path: 'COM4', manufacturer: 'Web Preview' }
      ],
      open: asyncOk,
      close: asyncOk,
      write: asyncOk,
      onData: () => emptyUnsubscribe,
      onEvent: () => emptyUnsubscribe
    },
    modbus: {
      open: async () => ({ ok: true }),
      close: async () => undefined,
      read: async () => ({ values: [] }),
      write: async () => ({ ok: true }),
      setPolls: async () => undefined,
      status: async () => 'closed',
      onData: () => emptyUnsubscribe,
      onEvent: () => emptyUnsubscribe
    },
    tcp: {
      open: asyncOk,
      write: asyncOk,
      close: asyncOk,
      onData: () => emptyUnsubscribe,
      onEvent: () => emptyUnsubscribe
    },
    tcpServer: {
      start: asyncOk,
      stop: asyncOk,
      status: async () => ({ ok: true }),
      broadcast: asyncOk,
      onData: () => emptyUnsubscribe,
      onEvent: () => emptyUnsubscribe
    },
    tcpShare: {
      start: asyncOk,
      stop: asyncOk,
      status: async () => ({ active: false })
    },
    window: {
      setFullscreen: noop,
      toggleFullscreen: noop,
      focus: noop,
      setOscilloscopeTop: noop
    },
    panel: {
      popout: asyncOk,
      onFocusFromPopout: () => emptyUnsubscribe,
      onDockRequest: () => emptyUnsubscribe,
      onHideRequest: () => emptyUnsubscribe,
      requestHide: noop,
      onLoadContent: () => emptyUnsubscribe,
      requestDock: noop,
      getPanelPortIdFromArgs: () => null,
      saveLog: asyncOk,
      setAlwaysOnTop: noop
    },
    scriptEditor: {
      popout: asyncOk,
      requestDock: noop,
      requestPayload: noop,
      onPopoutPayload: () => emptyUnsubscribe,
      onDock: () => emptyUnsubscribe,
      isPopout: () => false
    },
    scriptOutput: {
      popout: asyncOk,
      sync: noop,
      requestClose: noop,
      requestClear: noop,
      requestPayload: noop,
      onPopoutPayload: () => emptyUnsubscribe,
      onSync: () => emptyUnsubscribe,
      onClearRequest: () => emptyUnsubscribe,
      onClosed: () => emptyUnsubscribe,
      isPopout: () => false
    },
    config: {
      load: async () => panelConfigs,
      save: noop
    },
    commands: {
      load: async () => [],
      save: noop,
      flush: async () => {}
    },
    file: {
      readHex: async () => ({ hex: '', length: 0 }),
      pickOpen: async () => null,
      getPath: async () => ''
    },
    logger: {
      append: asyncOk,
      pickFile: async () => null
    },
    scripts: {
      dir: async () => '/scripts',
      list: async () => ['Demo.js'],
      read: async () => '/* SAE_GRAPH_START\n{\"nodes\":[],\"connections\":[]}\nSAE_GRAPH_END */\n',
      write: asyncOk,
      delete: asyncOk,
      rename: async () => ({ ok: true }),
      exportScript: async () => ({ ok: true, filePath: '/mock/export.js' }),
      importScript: async () => ({ ok: true, name: 'Imported.js' }),
      run: async () => ({ ok: true, runId: 'web-preview-run' }),
      stop: asyncOk,
      onEnded: () => emptyUnsubscribe,
      onLog: () => emptyUnsubscribe
    },
    shell: {
      openExternal: (url: string) => window.open(url, '_blank')
    },
    customComponents: {
      list: async () => [],
      read: async () => '',
      write: async () => ({ ok: true }),
      delete: async () => ({ ok: true }),
      rename: async () => ({ ok: true }),
      exportComponent: async () => ({ ok: false, canceled: true }),
      importComponents: async () => ({ ok: false, canceled: true })
    },
    app: {
      getVersion: async () => '0.6.0-preview',
      checkUpdate: noop,
      onFlushRequested: () => emptyUnsubscribe
    },
    changelog: {
      open: noop,
      request: noop,
      onLoad: () => emptyUnsubscribe
    },
    about: {
      open: noop,
      request: noop,
      onLoad: () => emptyUnsubscribe
    },
    settings: {
      open: noop
    },
    theme: {
      set: (dark: boolean) => document.documentElement.classList.toggle('theme-dark', !!dark),
      onApply: () => emptyUnsubscribe
    },
    agent: {
      // 浏览器预览：无主进程解析能力。.txt/.md 等文本在向导侧经 file.text() 兜底读取；
      // 二进制文档（docx/xlsx/pdf）在 mock 下返回明确错误，不静默造假。
      parseDocument: async (filePath: string) => {
        if (/\.(docx|xlsx|pdf)$/i.test(filePath)) {
          return { ok: false, error: '浏览器预览不支持 docx/xlsx/pdf，请在 Electron 中使用' }
        }
        return { ok: false, error: '浏览器预览中请直接粘贴文本' }
      },
      writeKnowledge: async () => ({ ok: true, featId: 'FEAT-PROTOCOL-MOCK', goldId: 'GOLD-PROTOCOL-MOCK', traceId: 'mock-trace' }),
      chat: async () => ({ ok: false, error: '浏览器预览无 LLM 后端' }),
      chatAbort: noop,
      onChunk: () => emptyUnsubscribe,
      getLlmSettings: async () => ({ ok: true, settings: { currentId: null, providers: [] } }),
      saveLlmProvider: async () => ({ ok: true, settings: { currentId: null, providers: [] } }),
      deleteLlmProvider: async () => ({ ok: true, settings: { currentId: null, providers: [] } }),
      setCurrentLlmProvider: async () => ({ ok: true, settings: { currentId: null, providers: [] } }),
      testLlmProvider: async () => ({ ok: false, error: '浏览器预览不支持测试连接' }),
      probeModels: async () => ({ ok: false, error: '浏览器预览不支持探查模型' }),
      importFromCcSwitch: async () => ({ ok: false, error: '浏览器预览不支持导入 CC Switch' })
    }
  } as unknown as WindowAPI
})()
