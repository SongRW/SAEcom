import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { toast } from 'sonner'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { exportPanelLog } from '@/features/serial-panel/exportLog'
import { setActiveTransfer } from '@/features/serial-panel/dataBus'
import { YModemSender } from '@/features/serial-panel/transfer/ymodem'
import { useSettingsStore } from '@/shared/store/settings'
import type { AppendMode, TcpShareStatus } from '@shared/types'

/** 校验 hex 字符串，合法返回 null，非法返回中文错误描述（供 UI 展示） */
export function hexParseError(hex: string): string | null {
  const clean = String(hex || '').replace(/\s+/g, '')
  if (clean === '') return null // 空串合法（无数据），由调用方决定是否拦截
  if (!/^[0-9a-fA-F]*$/.test(clean)) return 'HEX 格式错误：包含非十六进制字符'
  if (clean.length % 2 !== 0) return 'HEX 格式错误：长度为奇数位'
  return null
}

/** hex 字符串（每字节两字符）→ Uint8Array。空串返回空数组，不抛错。 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = String(hex || '').replace(/\s+/g, '')
  if (clean === '') return new Uint8Array(0)
  const bytes = clean.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  return new Uint8Array(bytes)
}

/** 归一化保留条数输入（对齐 legacy renderer.js:196 showLimitDialog onConfirm）：<=0 → 1000，<10 → 10 */
function normalizeLimitCount(raw: string): number {
  let val = parseInt(raw, 10)
  if (isNaN(val) || val <= 0) val = 1000
  if (val < 10) val = 10
  return val
}

// 选项候选取自 legacy src/index.html #page-serial 的 <option> 列表
const DATA_BITS = [8, 7, 6, 5] // legacy databits 顺序
const STOP_BITS = [1, 2] // legacy stopbits 仅 1/2（无 1.5）
const PARITIES: ('none' | 'even' | 'odd' | 'mark' | 'space')[] = ['none', 'even', 'odd', 'mark', 'space']
const APPENDS: AppendMode[] = ['CRLF', 'none', 'CR', 'LF'] // legacy #append 顺序
// none 需要翻译，CRLF/CR/LF 保持字面（协议名不翻译）
const APPEND_LABEL_KEY: Record<AppendMode, string> = {
  CRLF: 'CRLF',
  none: 'activePanel.appendNone',
  CR: 'CR',
  LF: 'LF'
}
const SEND_PROTOCOLS: { value: 'raw' | 'xmodem' | 'ymodem' | 'zmodem'; labelKey?: string; label: string; disabled?: boolean }[] = [
  { value: 'raw', labelKey: 'activePanel.sendRaw', label: '' },
  { value: 'xmodem', label: 'XModem', disabled: true },
  { value: 'ymodem', label: 'YModem' },
  { value: 'zmodem', label: 'ZModem', disabled: true }
]

/**
 * 底部「当前面板配置区」。绑定 usePanelsStore.activeId（直读，活跃面板唯一真相源）。
 * 逐行复刻 legacy src/index.html #page-serial（renderer.js setActive→fillPortSelect 回填）：
 *  L1 当前面板名 + 辅助按钮（添加备注/导出为文件/设置数据显示条数/实时保存/示波器）
 *  L2 串口参数（波特率[数字输入]/数据位/停止位/校验）—— TCP 隐藏
 *  L3 共享端口（serial only）
 *  L4 发送选项（接收缓冲/发送结尾/HEX发送/发送回显）—— 每面板独立
 *  L5 文件发送（文件名/选择文件/发送文件/发送协议）
 * 受控组件直接读 panel.*，切换 activeId 自动回填，无需 effect。
 */
export function ActivePanelConfigPanel() {
  const { t } = useTranslation()
  const ipc = useIPC()
  const activeId = usePanelsStore((s) => s.activeId)
  const panel = usePanelsStore((s) => (activeId ? s.panels[activeId] : null))
  const updateOptions = usePanelsStore((s) => s.updateOptions)
  const updateSendOptions = usePanelsStore((s) => s.updateSendOptions)
  const setNote = usePanelsStore((s) => s.setNote)
  const setLogging = usePanelsStore((s) => s.setLogging)
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)
  const setLimit = usePanelsStore((s) => s.setLimit)

  const [sharePort, setSharePort] = useState('9000')
  // 共享状态以后端为唯一真相源（对齐 legacy refreshShareUI：renderer.js:4489-4516）。
  // 切面板 / 串口开闭变化时重新 query tcpShare.status，避免本地 state 与后端脱节。
  const [shareStatus, setShareStatus] = useState<TcpShareStatus | null>(null)
  const [fileName, setFileName] = useState('')
  const [filePath, setFilePath] = useState('')
  const [sendProtocol, setSendProtocol] = useState<'raw' | 'xmodem' | 'ymodem' | 'zmodem'>('raw')
  const [sending, setSending] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)
  const charEncoding = useSettingsStore((s) => s.charEncoding)

  // 切换面板 / 串口开闭时，向后端查询共享状态（仅串口面板）。
  // 对齐 legacy refreshShareUI（renderer.js:4489-4516 + setActive 钩子 :4536-4540）。
  const panelOpen = panel?.open
  useEffect(() => {
    if (!activeId || !panel || panel.type !== 'serial') {
      setShareStatus(null)
      return
    }
    let cancelled = false
    ipc.tcpShare
      .status(activeId)
      .then((st) => {
        if (!cancelled) setShareStatus(st)
      })
      .catch(() => {
        /* web 预览无 ipc，忽略 */
      })
    return () => {
      cancelled = true
    }
    // panel.open 变化（开/关串口）也要刷新；panel.type 仅在 activeId 切换时变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, panel?.type, panelOpen, ipc])

  // 空状态
  if (!panel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">{t('activePanel.emptyHint')}</p>
      </div>
    )
  }

  const pnl = panel
  const isSerial = pnl.type === 'serial'

  async function handleAddNote() {
    setNoteOpen(true)
  }

  async function handleExport() {
    try {
      await exportPanelLog(pnl)
      appendSysLine(pnl.id, t('activePanel.sys.exported'))
    } catch (e) {
      appendSysLine(pnl.id, t('activePanel.sys.exportFail', { msg: String(e) }))
    }
  }

  async function refreshShareStatus() {
    try {
      const st = await ipc.tcpShare.status(pnl.id)
      setShareStatus(st)
      if (st.active && st.port) setSharePort(String(st.port))
    } catch {
      /* web 预览无 ipc，忽略 */
    }
  }

  async function handleToggleShare() {
    // 对齐 legacy renderer.js:4509 —— 串口未打开时不允许共享
    if (!pnl.open) { appendSysLine(pnl.id, t('activePanel.sys.notOpen')); return }
    try {
      if (shareStatus?.active) {
        await ipc.tcpShare.stop(pnl.id)
        appendSysLine(pnl.id, t('activePanel.sys.shareStopped'))
      } else {
        const port = Number(sharePort)
        if (!port) { appendSysLine(pnl.id, t('activePanel.sys.shareInvalid')); return }
        await ipc.tcpShare.start(pnl.id, port)
        appendSysLine(pnl.id, t('activePanel.sys.shared', { port }))
      }
      await refreshShareStatus()
    } catch (e) {
      // 后端已实现（electron/main.ts:562），仅 ipc 缺失（web 预览）才走到这里
      appendSysLine(pnl.id, t('activePanel.sys.shareFail', { msg: String(e) }))
    }
  }

  function handleCopyShareAddr() {
    const addr = shareStatus?.best || shareStatus?.addrs?.[0] || ''
    if (!addr) return
    navigator.clipboard
      ?.writeText(addr)
      .then(() => {
        toast.success(t('activePanel.copied', { addr }))
      })
      .catch(() => {
        appendSysLine(pnl.id, t('activePanel.sys.copyFail', { addr }))
      })
  }

  async function handleChooseFile() {
    try {
      const fp = await ipc.file.pickOpen()
      if (!fp) return
      setFilePath(fp)
      setFileName(fp.split(/[\\/]/).pop() || fp)
    } catch (e) {
      appendSysLine(pnl.id, t('activePanel.sys.pickFail', { msg: String(e) }))
    }
  }

  async function sendFile(fp: string, protocol: 'raw' | 'ymodem') {
    if (!pnl.open) {
      appendSysLine(pnl.id, t('activePanel.sys.portNotOpen'))
      return
    }
    setSending(true)
    try {
      const res = (await ipc.file.readHex(fp)) as { hex?: string; error?: string }
      if (res.error) {
        appendSysLine(pnl.id, t('activePanel.sys.writeError', { msg: res.error }))
        return
      }
      const hexRaw = res.hex || ''
      const parseErr = hexParseError(hexRaw)
      if (parseErr) {
        appendSysLine(pnl.id, t('activePanel.sys.parseError', { msg: parseErr }))
        return
      }
      const bytes = hexToBytes(hexRaw)
      const write = async (data: Uint8Array) => {
        const hex = Array.from(data)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const w =
          pnl.type === 'tcp'
            ? await ipc.tcp.write(pnl.id, hex, 'hex', 'none', charEncoding)
            : await ipc.serial.write(pnl.id, hex, 'hex', 'none', charEncoding)
        if (w && !w.ok) throw new Error(w.error || '写入失败')
      }

      if (protocol === 'ymodem') {
        const sender = new YModemSender(pnl.id, write, 'ymodem', (m) => appendSysLine(pnl.id, t('activePanel.sys.ymodem', { msg: m })))
        setActiveTransfer(sender)
        try {
          await sender.start(bytes, fileName || 'file')
        } finally {
          setActiveTransfer(null)
        }
      } else {
        // raw 分块发送
        const chunkSize = 1024
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.slice(offset, offset + chunkSize)
          await write(chunk)
          const progress = Math.min(100, Math.round(((offset + chunk.length) / bytes.length) * 100))
          if (offset % (chunkSize * 20) === 0 || offset + chunk.length >= bytes.length) {
            appendSysLine(pnl.id, t('activePanel.sys.fileProgress', { progress }))
          }
        }
        appendSysLine(pnl.id, t('activePanel.sys.fileDone'))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误'
      appendSysLine(pnl.id, t('activePanel.sys.fileFail', { msg }))
    } finally {
      setSending(false)
    }
  }

  async function handleSendFile() {
    if (!filePath) { appendSysLine(pnl.id, t('activePanel.sys.filePickFirst')); return }
    // xmodem/zmodem 尚未迁移，回退到 raw/ymodem
    const proto = sendProtocol === 'ymodem' ? 'ymodem' : 'raw'
    await sendFile(filePath, proto)
  }

  return (
    <>
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1.5 px-3 py-1.5 text-xs">
      {/* L1 当前面板名 + 辅助按钮 */}
      <div className="flex flex-wrap items-center gap-1">
        <Label>{t('activePanel.currentPanel')}</Label>
        <span className="select-none font-medium">{pnl.name}</span>
        {pnl.note ? <span className="text-muted-foreground">（{pnl.note}）</span> : null}
        <span className="mx-1 h-3 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleAddNote}>{t('activePanel.addNote')}</Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleExport}>{t('activePanel.exportFile')}</Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Button
          variant={pnl.limitView ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-2"
          title={pnl.limitView ? t('activePanel.limitOff', { count: pnl.limitCount }) : t('activePanel.limitOn')}
          onClick={() => setLimitOpen(true)}
        >
          {t('activePanel.setLimit')}
        </Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Button
          variant={pnl.logging.active ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-2"
          onClick={async () => {
            if (pnl.logging.active) {
              setLogging(pnl.id, false, null)
            } else {
              const path = await ipc.logger.pickFile()
              if (path) setLogging(pnl.id, true, path)
            }
          }}
        >
          {pnl.logging.active ? t('activePanel.stopSave') : t('activePanel.liveSave')}
        </Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => useOscilloscopeStore.getState().openPane(pnl.id)}>{t('activePanel.oscilloscope')}</Button>
      </div>

      {/* L2 串口参数（TCP 隐藏）—— 波特率用数字输入，对齐 legacy #baud */}
      {isSerial && (
        <div className="flex flex-wrap items-center gap-1">
          <Label>{t('activePanel.baudRate')}</Label>
          <Input
            type="number"
            min={110}
            step={1}
            className="h-6 w-24"
            value={pnl.options.baudRate}
            onChange={(e) => updateOptions(pnl.id, { baudRate: Number(e.target.value) || 0 })}
          />
          <span className="mx-1 h-3 w-px bg-border" />
          <Label>{t('activePanel.dataBits')}</Label>
          <Select value={String(pnl.options.dataBits)} onValueChange={(v) => updateOptions(pnl.id, { dataBits: Number(v) })}>
            <SelectTrigger className="h-6 w-14"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATA_BITS.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="mx-1 h-3 w-px bg-border" />
          <Label>{t('activePanel.stopBits')}</Label>
          <Select value={String(pnl.options.stopBits)} onValueChange={(v) => updateOptions(pnl.id, { stopBits: Number(v) })}>
            <SelectTrigger className="h-6 w-14"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STOP_BITS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="mx-1 h-3 w-px bg-border" />
          <Label>{t('activePanel.parity')}</Label>
          <Select value={pnl.options.parity} onValueChange={(v) => updateOptions(pnl.id, { parity: v as 'none' | 'even' | 'odd' | 'mark' | 'space' })}>
            <SelectTrigger className="h-6 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PARITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* L3 共享端口（serial only）—— 对齐 legacy #row-share-container */}
      {isSerial && (
        <div className="flex flex-wrap items-center gap-1">
          <Label>{t('activePanel.sharePort')}</Label>
          <Input
            type="number"
            min={1}
            max={65535}
            className="h-6 w-20"
            value={sharePort}
            onChange={(e) => setSharePort(e.target.value)}
          />
          <Button
            variant={shareStatus?.active ? 'default' : 'outline'}
            size="sm"
            className="h-6 px-2"
            onClick={handleToggleShare}
          >
            {shareStatus?.active ? t('activePanel.stopShare') : t('activePanel.shareAsTcp')}
          </Button>
          {/* 共享中：展示地址 + 复制按钮（对齐 legacy refreshShareUI 的 shareInfo / btnCopyShare） */}
          {shareStatus?.active && (
            <>
              <span className="text-primary">
                {t('activePanel.sharedAs')} {shareStatus.best || shareStatus.addrs?.[0] || `端口 ${shareStatus.port ?? ''}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                title={t('activePanel.copyShareAddr')}
                onClick={handleCopyShareAddr}
              >
                <Clipboard data-icon="inline-start" />
                {t('activePanel.copy')}
              </Button>
            </>
          )}
        </div>
      )}

      {/* L4 发送选项（每面板独立）—— 对齐 legacy #row-send-opts 顺序：缓冲/结尾/HEX/回显 */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-1">
        <Label>{t('activePanel.bufferTime')}</Label>
        <Input
          type="number"
          min={0}
          step={1}
          className="h-6 w-20"
          value={pnl.sendOptions.bufferTime}
          onChange={(e) => updateSendOptions(pnl.id, { bufferTime: Number(e.target.value) || 0 })}
        />
        <span className="mx-1 h-3 w-px bg-border" />
        <Label>{t('activePanel.appendEnding')}</Label>
        <Select value={pnl.sendOptions.append} onValueChange={(v) => updateSendOptions(pnl.id, { append: v as AppendMode })}>
          <SelectTrigger className="h-6 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {APPENDS.map((a) => {
              const key = APPEND_LABEL_KEY[a]
              const label = key === 'activePanel.appendNone' ? t(key) : key
              return <SelectItem key={a} value={a}>{label}</SelectItem>
            })}
          </SelectContent>
        </Select>
        <span className="mx-1 h-3 w-px bg-border" />
        <Label className="flex items-center gap-1">
          <Switch checked={pnl.sendOptions.hexMode} onCheckedChange={(v) => updateSendOptions(pnl.id, { hexMode: v })} />
          {t('activePanel.sendAsHex')}
        </Label>
        <span className="mx-1 h-3 w-px bg-border" />
        <Label className="flex items-center gap-1">
          <Switch checked={pnl.sendOptions.echoSend} onCheckedChange={(v) => updateSendOptions(pnl.id, { echoSend: v })} />
          {t('activePanel.echoSend')}
        </Label>
      </div>

      {/* L5 文件发送 —— 对齐 legacy #fileName/#btnChooseFile/#btnSendFile/#sendProtocol */}
      <div className="flex flex-wrap items-center gap-1">
        <Label>{t('activePanel.fileName')}</Label>
        <Input
          type="text"
          readOnly
          className="h-6 w-56"
          placeholder={t('activePanel.fileNamePlaceholder')}
          value={fileName}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (!f) return
            try {
              const fp = ipc.file.getPath(f)
              if (!fp) return
              setFilePath(fp)
              setFileName(f.name)
            } catch (err) {
              appendSysLine(pnl.id, t('activePanel.sys.dropFail', { msg: String(err) }))
            }
          }}
        />
        <span className="mx-1 h-3 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleChooseFile}>{t('activePanel.pickFile')}</Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-6 px-2" disabled={!pnl.open || sending} onClick={handleSendFile}>
          {sending ? t('activePanel.sending') : t('activePanel.sendFile')}
        </Button>
        <span className="mx-1 h-3 w-px bg-border" />
        <Label>{t('activePanel.sendProtocol')}</Label>
        <Select value={sendProtocol} onValueChange={(v) => setSendProtocol(v as 'raw' | 'xmodem' | 'ymodem' | 'zmodem')}>
          <SelectTrigger className="h-6 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SEND_PROTOCOLS.map((p) => (
              <SelectItem key={p.value} value={p.value} disabled={p.disabled}>{p.labelKey ? t(p.labelKey) : p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      </div>
    </ScrollArea>
    <PromptDialog
      open={noteOpen}
      onOpenChange={setNoteOpen}
      title={t('activePanel.noteTitle')}
      description={t('activePanel.noteDesc')}
      defaultValue={pnl.note || ''}
      maxLength={15}
      onConfirm={(v) => setNote(pnl.id, v)}
    />
    <PromptDialog
      open={limitOpen}
      onOpenChange={setLimitOpen}
      title={t('activePanel.limitTitle')}
      description={t('activePanel.limitDesc')}
      defaultValue={String(pnl.limitCount)}
      onConfirm={(v) => setLimit(pnl.id, true, normalizeLimitCount(v))}
      {...(pnl.limitView
        ? {
            extraAction: {
              text: t('activePanel.closeLimit'),
              onAction: () => {
                setLimitOpen(false)
                setLimit(pnl.id, false, pnl.limitCount)
              }
            }
          }
        : {})}
    />
    </>
  )
}
