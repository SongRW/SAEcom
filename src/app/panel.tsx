import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '@/shared/i18n'
import '@/styles/globals.css'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import { formatBytes, nowTs, renderChunks, DEFAULT_SERIAL_OPTIONS } from '@/features/serial-panel/paneViewModel'
import type { PanelChunk, PanelType, ViewMode, SerialOptions } from '@/features/serial-panel/types'
import type { AppendMode, ModbusBlock, ModbusConnectOptions } from '@shared/types'
import { ArrowsInCardinal, PushPin, PushPinSlash, Code, TextAa, Power, PaperPlane } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TitleBarChrome } from '@/features/titlebar'
import ModbusBlockTable from '@/features/modbus-panel/components/ModbusBlockTable'

const APPEND_OPTIONS: { value: AppendMode; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'LF', label: '+ \\n' },
  { value: 'CR', label: '+ \\r' },
  { value: 'CRLF', label: '+ \\r\\n' }
]

/** 从 URL query 解析 popout 参数 */
function readQuery() {
  const p = new URLSearchParams(window.location.search)
  const id = p.get('id') || ''
  const title = p.get('title') || id
  const isOpen = p.get('isOpen') === '1'
  const viewModeRaw = p.get('viewMode') || 'text'
  // modbus 面板借用 viewMode 槽位传 'modbus' 标识（见 FloatingPane.handlePopout）
  const isModbus = viewModeRaw === 'modbus'
  const type: PanelType = isModbus ? 'modbus'
    : id.startsWith('tcp://') ? 'tcp' : 'serial'
  const viewMode = isModbus ? 'text' : (viewModeRaw as ViewMode)
  let opts: SerialOptions = { ...DEFAULT_SERIAL_OPTIONS }
  try {
    const o = JSON.parse(p.get('opts') || '{}')
    opts = { ...DEFAULT_SERIAL_OPTIONS, ...o }
  } catch {
    /* 默认 */
  }
  // modbus 配置从 opts 解析（serial/tcp 仍解析 SerialOptions）
  let modbusData: { connectOptions: ModbusConnectOptions; blocks: ModbusBlock[]; blockValues: Record<string, { values: number[]; ts: number; error?: string }> } | null = null
  if (isModbus) {
    try { modbusData = JSON.parse(p.get('opts') || 'null') } catch { /* ignore */ }
  }
  return { id, title, isOpen, viewMode, opts, type, modbusData }
}

/**
 * popout 独立窗口的 React 面板。
 * - 读 URL query 获取 id/title/viewMode/options
 * - onLoadContent 收主窗传来的历史 chunks
 * - 自己注册 serial/tcp onData，按 id 过滤接收后续数据（解决双窗：各自独立）
 * - dock 回按钮：把当前 chunks 传回主窗（保留粒度，不扁平化）
 * - pin 按钮：实时切换本窗 alwaysOnTop（panel.setAlwaysOnTop IPC）
 */
function PopoutPanel() {
  const ipc = useIPC()
  const q = useRef(readQuery()).current
  const [chunks, setChunks] = useState<PanelChunk[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(q.viewMode)
  const [open, setOpen] = useState(q.isOpen)
  const [pinned, setPinned] = useState(true) // popout 默认置顶（对应 legacy alwaysOnTop 默认 true）
  const scrollRef = useRef<HTMLDivElement>(null)
  // modbus 本地状态（仅 type==='modbus' 时使用；由主窗驱动连接状态，此处只读显示）
  const [modbusBlocks, setModbusBlocks] = useState<ModbusBlock[]>(q.modbusData?.blocks ?? [])
  const [blockValues, setBlockValues] = useState<Record<string, { values: number[]; ts: number; error?: string }>>(q.modbusData?.blockValues ?? {})
  const [modbusStatus, setModbusStatus] = useState<'closed' | 'open' | 'error'>(q.isOpen ? 'open' : 'closed')

  // 收历史 chunks
  useEffect(() => {
    return ipc.panel.onLoadContent(({ historyStr }) => {
      try {
        const hist = JSON.parse(historyStr)
        if (Array.isArray(hist)) setChunks(hist)
      } catch {
        /* ignore */
      }
    })
  }, [ipc])

  // 跟随主窗白天/夜间模式：挂载时按本地设置初始化，并监听主窗广播的实时切换
  // （theme:set → main 向所有窗口广播 theme:apply；独立窗口不共享主窗 zustand store）
  useEffect(() => {
    const apply = (dark: boolean) => {
      const el = document.documentElement
      el.classList.toggle('dark', dark)
      el.classList.toggle('theme-dark', dark)
    }
    apply(useSettingsStore.getState().dark)
    const handler = ({ dark }: { dark: boolean }) => apply(!!dark)
    return ipc.theme.onApply(handler)
  }, [ipc])

  // 注册 onData（独立于主窗，按本窗 id 过滤）
  useEffect(() => {
    const settings = useSettingsStore.getState()
    const enc = settings.charEncoding || 'utf-8'
    const rxTs = settings.rxTimestamp !== false

    const onData = ({ id, bytes }: { id: string; bytes: Uint8Array }) => {
      if (id !== q.id) return // 仅本面板
      const ts = nowTs()
      const textStr = formatBytes(bytes, 'text', enc)
      const hexStr = formatBytes(bytes, 'hex', enc)
      const prefix = rxTs ? `[${ts}] ` : ''
      setChunks((prev) => [...prev, { text: prefix + textStr, hex: prefix + hexStr, isEcho: false }])
    }
    const onEvent = (e: { id: string; type: string; message?: string }) => {
      if (e.id !== q.id) return
      if (e.type === 'open') {
        setOpen(true)
        setChunks((p) => [...p, { text: '[已打开]\n', hex: '[已打开]\n', isEcho: false }])
      } else if (e.type === 'close') {
        setOpen(false)
        setChunks((p) => [...p, { text: '[已关闭]\n', hex: '[已关闭]\n', isEcho: false }])
      }
    }
    const offSerialData = ipc.serial.onData(onData)
    const offSerialEvent = ipc.serial.onEvent(onEvent)
    const offTcpData = ipc.tcp?.onData(onData)
    const offTcpEvent = ipc.tcp?.onEvent(onEvent)
    // modbus 监听：按 panelId 过滤，更新区块值缓存与连接状态
    let offModbusData: (() => void) | undefined
    let offModbusEvent: (() => void) | undefined
    if (q.type === 'modbus') {
      const onModbusData = (u: { panelId: string; blockId: string; values: number[]; ts: number; error?: string }) => {
        if (u.panelId !== q.id) return
        setBlockValues((prev) => ({ ...prev, [u.blockId]: { values: u.values, ts: u.ts, error: u.error } }))
      }
      const onModbusEvent = (e: { id: string; type: string; message?: string }) => {
        if (e.id !== q.id) return
        if (e.type === 'open') setModbusStatus('open')
        else if (e.type === 'close') setModbusStatus('closed')
        else if (e.type === 'error') setModbusStatus('error')
      }
      offModbusData = ipc.modbus.onData(onModbusData)
      offModbusEvent = ipc.modbus.onEvent(onModbusEvent)
    }
    return () => {
      offSerialData()
      offSerialEvent()
      offTcpData?.()
      offTcpEvent?.()
      offModbusData?.()
      offModbusEvent?.()
    }
  }, [ipc, q.id, q.type])

  // autoScroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chunks])

  function handleTogglePin() {
    const next = !pinned
    setPinned(next)
    ipc.panel.setAlwaysOnTop(q.id, next)
  }

  async function handleToggleOpen() {
    if (open) {
      q.type === 'tcp' ? await ipc.tcp.close(q.id) : await ipc.serial.close(q.id)
    } else {
      q.type === 'tcp' ? await openTcp(q.id, q.opts) : await ipc.serial.open(q.id, q.opts)
    }
  }

  /** 解析 tcp://host:port 并打开（与 store.ts 同一正则，避免 split 索引取到主机名导致 port=NaN）。 */
  async function openTcp(id: string, opts: SerialOptions) {
    const m = id.match(/^tcp:\/\/([^:]+):(\d+)$/)
    if (!m) {
      setChunks((p) => [...p, { text: '[错误] TCP 地址格式无效\n', hex: '[错误] TCP 地址格式无效\n', isEcho: false }])
      return
    }
    await ipc.tcp.open(m[1], Number(m[2]), opts)
  }

  function handleDock() {
    // dock 回主窗：传回当前 chunks（JSON，保留粒度）
    ipc.panel.requestDock(q.id, JSON.stringify(chunks))
    window.close()
  }

  function handleHide() {
    ipc.panel.requestHide(q.id)
  }

  // —— 自包含发送栏（独立窗口不共享主窗 store，本地 state + 直接 IPC 发送）——
  const [sendText, setSendText] = useState('')
  const [sendMode, setSendMode] = useState<'text' | 'hex'>('text')
  const [append, setAppend] = useState<AppendMode>('none')

  async function handleSend() {
    const data = sendText
    if (!data) return
    if (!open) {
      setChunks((p) => [...p, { text: '[错误] 端口未打开，无法发送\n', hex: '[错误] 端口未打开，无法发送\n', isEcho: false }])
      return
    }
    if (sendMode === 'hex') {
      const clean = data.replace(/[\s,]/g, '')
      if (clean.length % 2 !== 0) {
        setChunks((p) => [...p, { text: '[系统] HEX 长度必须为偶数\n', hex: '[系统] HEX 长度必须为偶数\n', isEcho: false }])
        return
      }
    }
    try {
      const settings = useSettingsStore.getState()
      const enc = settings.charEncoding || 'utf-8'
      const res =
        q.type === 'tcp'
          ? await ipc.tcp.write(q.id, data, sendMode, append, enc)
          : await ipc.serial.write(q.id, data, sendMode, append, enc)
      if (res && !res.ok) {
        setChunks((p) => [...p, { text: `[错误] 发送失败：${res.error || ''}\n`, hex: `[错误] 发送失败：${res.error || ''}\n`, isEcho: false }])
      } else if (settings.echoSend) {
        const ts = settings.txTimestamp !== false ? `[${nowTs()}] ` : ''
        setChunks((p) => [...p, { text: ts + data + '\n', hex: ts + data + '\n', isEcho: true }])
      }
    } catch (e) {
      setChunks((p) => [...p, { text: `[错误] 发送失败：${String(e)}\n`, hex: `[错误] 发送失败：${String(e)}\n`, isEcho: false }])
    }
  }

  const rendered = renderChunks(chunks, viewMode)

  // modbus 只读弹出：状态条 + 区块表（readOnly）。连接状态由主窗驱动，本窗只显示。
  // dock/hide/pin 按钮沿用主壳逻辑（panel.requestDock/requestHide/setAlwaysOnTop 对任意窗口通用）。
  if (q.type === 'modbus' && q.modbusData) {
    return (
      <div className="flex h-screen flex-col bg-card text-foreground">
        <TitleBarChrome
          title={q.title}
          right={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" onClick={handleTogglePin} title={pinned ? '取消置顶' : '置顶'}>
                {pinned ? <PushPinSlash className="size-4" weight="fill" /> : <PushPin className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleDock} title="嵌回主窗口">
                <ArrowsInCardinal className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleHide} title="隐藏">
                ✕
              </Button>
            </div>
          }
        />
        {/* 状态条：只读显示连接状态 */}
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <span>Modbus {q.modbusData.connectOptions.variant?.toUpperCase()}</span>
          <span className={modbusStatus === 'open' ? 'text-emerald-500' : modbusStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
            {modbusStatus === 'open' ? '● 已连接' : modbusStatus === 'error' ? '⚠ 错误' : '○ 未连接'}
          </span>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-2">
          {modbusBlocks.map((b) => (
            <ModbusBlockTable
              key={b.id}
              panelId={q.id}
              block={b}
              value={blockValues[b.id]}
              readOnly
            />
          ))}
          {modbusBlocks.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">暂无区块</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-card text-foreground">
      {/* 标题栏：复用 TitleBarChrome，面板功能按钮迁入 right 插槽 */}
      <TitleBarChrome
        title={q.title}
        right={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={handleTogglePin} title={pinned ? '取消置顶' : '置顶'}>
              {pinned ? <PushPinSlash className="size-4" weight="fill" /> : <PushPin className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setViewMode(viewMode === 'text' ? 'hex' : 'text')} title="文本/HEX">
              {viewMode === 'hex' ? <Code className="size-4" /> : <TextAa className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`size-7 ${open ? 'text-success' : 'text-muted-foreground'}`}
              onClick={handleToggleOpen}
              title={open ? '关闭' : '打开'}
            >
              <Power className="size-4" weight={open ? 'fill' : 'regular'} />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleDock} title="嵌回主窗口">
              <ArrowsInCardinal className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleHide} title="隐藏">
              ✕
            </Button>
          </div>
        }
      />
      {/* 数据展示 */}
      <ScrollArea viewportRef={scrollRef} className="flex-1 whitespace-pre-wrap break-all p-2 font-mono text-xs leading-relaxed">
        {rendered.map((c, i) =>
          c.isEcho ? (
            <span key={i} className="text-primary">
              {c.text}
            </span>
          ) : (
            <span key={i}>{c.text}</span>
          )
        )}
      </ScrollArea>
      {/* 发送栏（镜像主窗 SendBar：输入 + 模式 + 结尾 + 发送；独立窗口自包含，不依赖主窗 store） */}
      <div className="flex items-center gap-1.5 border-t bg-muted/30 px-2 py-1.5">
        <Input
          value={sendText}
          onChange={(e) => setSendText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={sendMode === 'hex' ? 'HEX, 如 A1 01 01' : '发送内容'}
          className="h-8 flex-1 font-mono text-xs"
        />
        <Select value={sendMode} onValueChange={(v) => setSendMode(v as 'text' | 'hex')}>
          <SelectTrigger className="h-8 w-[68px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">文本</SelectItem>
            <SelectItem value="hex">HEX</SelectItem>
          </SelectContent>
        </Select>
        <Select value={append} onValueChange={(v) => setAppend(v as AppendMode)}>
          <SelectTrigger className="h-8 w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPEND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 px-3" disabled={!open} onClick={handleSend}>
          <PaperPlane data-icon="inline-start" />
          发送
        </Button>
      </div>
    </div>
  )
}

/** 独立窗口渲染异常兜底，避免整窗白屏 */
class PopoutErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PopoutPanel] render crashed:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>面板渲染失败：</div>
          {String(this.state.error?.message || this.state.error)}
          {'\n\n'}
          {this.state.error?.stack || ''}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopoutErrorBoundary>
      <PopoutPanel />
    </PopoutErrorBoundary>
  </React.StrictMode>
)
