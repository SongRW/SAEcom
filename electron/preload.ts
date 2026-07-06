import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import type { WindowAPI } from '../shared/types'

const api: WindowAPI = {
  tcp: {
    open: (host, port, options) => ipcRenderer.invoke('tcp:open', { host, port, options }),
    write: (id, data, mode, append, encoding) => ipcRenderer.invoke('tcp:write', { id, data, mode, append, encoding }),
    close: (id) => ipcRenderer.invoke('tcp:close', { id }),
    onData: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: any) => cb({ id: p.id, bytes: p.bytes, ts: p.ts })
      ipcRenderer.on('tcp:data', listener)
      return () => ipcRenderer.off('tcp:data', listener)
    },
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: any) => cb(p)
      ipcRenderer.on('tcp:event', listener)
      return () => ipcRenderer.off('tcp:event', listener)
    }
  },
  tcpServer: {
    start: (port) => ipcRenderer.invoke('tcpServer:start', { port }),
    stop: (id) => ipcRenderer.invoke('tcpServer:stop', { id }),
    status: (id) => ipcRenderer.invoke('tcpServer:status', { id }),
    broadcast: (id, data, mode, append, encoding) => ipcRenderer.invoke('tcpServer:broadcast', { id, data, mode, append, encoding }),
    onData: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: any) => cb({ serverId: p.serverId, clientId: p.clientId, bytes: p.bytes, ts: p.ts })
      ipcRenderer.on('tcpServer:data', listener)
      return () => ipcRenderer.off('tcpServer:data', listener)
    },
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: any) => cb(p)
      ipcRenderer.on('tcpServer:event', listener)
      return () => ipcRenderer.off('tcpServer:event', listener)
    }
  },
  tcpShare: {
    start: (id, port) => ipcRenderer.invoke('tcpShare:start', { id, port }),
    stop: (id) => ipcRenderer.invoke('tcpShare:stop', { id }),
    status: (id) => ipcRenderer.invoke('tcpShare:status', { id })
  },
  window: {
    setFullscreen: (flag) => ipcRenderer.send('window:set-fullscreen', { flag }),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
    focus: () => ipcRenderer.send('window:focus'),
    setOscilloscopeTop: (flag) => ipcRenderer.send('window:set-oscilloscope-top', { flag }),
    platform: () => ipcRenderer.invoke('window:platform'),
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => {
      ipcRenderer.send('window:subscribeMaximize')
      const listener = (_e: Electron.IpcRendererEvent, max: boolean) => cb(max)
      ipcRenderer.on('window:maximizeChange', listener)
      return () => ipcRenderer.removeListener('window:maximizeChange', listener)
    }
  },
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    open: (path, options) => ipcRenderer.invoke('serial:open', { path, options }),
    close: (id) => ipcRenderer.invoke('serial:close', { id }),
    write: (id, data, mode = 'text', append = 'none', encoding = 'utf-8') =>
      ipcRenderer.invoke('serial:write', { id, data, mode, append, encoding }),
    onData: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => {
        cb({ id: payload.id, bytes: payload.bytes, ts: payload.ts })
      }
      ipcRenderer.on('serial:data', listener)
      return () => ipcRenderer.off('serial:data', listener)
    },
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('serial:event', listener)
      return () => ipcRenderer.off('serial:event', listener)
    }
  },
  panel: {
    popout: (id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr) =>
      ipcRenderer.invoke('panel:popout', { id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr }),
    onFocusFromPopout: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('panel:focus', listener)
      return () => ipcRenderer.off('panel:focus', listener)
    },
    onDockRequest: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('panel:dock', listener)
      return () => ipcRenderer.off('panel:dock', listener)
    },
    onHideRequest: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('panel:hide', listener)
      return () => ipcRenderer.off('panel:hide', listener)
    },
    requestHide: (id) => ipcRenderer.send('panel:request-hide', { id }),
    onLoadContent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('panel:loadContent', listener)
      return () => ipcRenderer.off('panel:loadContent', listener)
    },
    requestDock: (id, html) => ipcRenderer.send('panel:request-dock', { id, html }),
    getPanelPortIdFromArgs: () => {
      const arg = (process.argv || []).find((a: string) => a.startsWith('--panelPortId='))
      if (!arg) return null
      return decodeURIComponent(arg.split('=')[1])
    },
    saveLog: (name, content) => ipcRenderer.invoke('panel:saveLog', { name, content }),
    setAlwaysOnTop: (id, onTop) => ipcRenderer.send('panel:set-always-on-top', { id, onTop })
  },
  scriptEditor: {
    popout: () => ipcRenderer.invoke('script-editor:popout'),
    requestDock: () => ipcRenderer.send('script-editor:request-dock'),
    onDock: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('script-editor:dock', listener)
      return () => ipcRenderer.off('script-editor:dock', listener)
    },
    isPopout: () => (process.argv || []).includes('--script-editor-popout')
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (panels) => ipcRenderer.send('config:save', panels)
  },
  commands: {
    load: () => ipcRenderer.invoke('commands:load'),
    save: (cmds) => ipcRenderer.send('commands:save', cmds),
    flush: () => ipcRenderer.invoke('commands:flush')
  },
  file: {
    readHex: (filePath) => ipcRenderer.invoke('file:readHex', filePath),
    pickOpen: () => ipcRenderer.invoke('file:pickOpen'),
    getPath: (file: File) => webUtils.getPathForFile(file)
  },
  logger: {
    append: (filePath, text) => ipcRenderer.invoke('logger:append', filePath, text),
    pickFile: () => ipcRenderer.invoke('logger:pickFile')
  },
  shell: {
    openExternal: (url) => shell.openExternal(url)
  },
  scripts: {
    dir: () => ipcRenderer.invoke('scripts:dir'),
    list: () => ipcRenderer.invoke('scripts:list'),
    read: (name) => ipcRenderer.invoke('scripts:read', name),
    write: (name, content) => ipcRenderer.invoke('scripts:write', { name, content }),
    delete: (name) => ipcRenderer.invoke('scripts:delete', name),
    rename: (oldName, newName) => ipcRenderer.invoke('scripts:rename', { oldName, newName }),
    exportScript: (name) => ipcRenderer.invoke('scripts:export', name),
    run: (code, ctx) => ipcRenderer.invoke('scripts:run', { code, ctx }),
    stop: (runId) => ipcRenderer.invoke('scripts:stop', { runId }),
    onEnded: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('scripts:ended', listener)
      return () => ipcRenderer.removeListener('scripts:ended', listener)
    },
    onLog: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('scripts:log', listener)
      return () => ipcRenderer.removeListener('scripts:log', listener)
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    checkUpdate: () => ipcRenderer.send('app:checkUpdate'),
    /** 主进程退出前 flush 请求的监听。返回 unsubscribe。 */
    onFlushRequested: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('app:flush-requested', listener)
      return () => ipcRenderer.off('app:flush-requested', listener)
    }
  },
  changelog: {
    open: () => ipcRenderer.send('changelog:open'),
    request: () => ipcRenderer.send('changelog:request'),
    onLoad: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('changelog:content', listener)
      return () => ipcRenderer.off('changelog:content', listener)
    }
  },
  about: {
    open: () => ipcRenderer.send('about:open'),
    request: () => ipcRenderer.send('about:request'),
    onLoad: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, info: any) => cb(info)
      ipcRenderer.on('about:content', listener)
      return () => ipcRenderer.off('about:content', listener)
    }
  },
  theme: {
    set: (dark) => ipcRenderer.send('theme:set', { dark }),
    onApply: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('theme:apply', listener)
      return () => ipcRenderer.off('theme:apply', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
