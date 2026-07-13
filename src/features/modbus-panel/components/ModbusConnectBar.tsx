import { useState } from 'react'
import { Plug, X, CircleNotch, Warning } from '@phosphor-icons/react'
import type { ModbusConnectOptions, ModbusVariant } from '@shared/types'
import type { Panel } from '@/features/serial-panel/types'
import { usePanelsStore } from '@/features/serial-panel/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const VARIANT_LABELS: Record<ModbusVariant, string> = {
  tcp: 'TCP',
  rtu: 'RTU',
  ascii: 'ASCII',
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200]
const SERIAL_PARITIES = ['none', 'even', 'odd'] as const

/** 残缺错误显示的最大宽度字符；超出用 title 显示完整信息 */
const MAX_ERROR_LEN = 28

function truncateError(err?: string): string {
  if (!err) return '错误'
  return err.length > MAX_ERROR_LEN ? err.slice(0, MAX_ERROR_LEN) + '…' : err
}

function StatusBadge({ panel }: { panel: Panel }) {
  const status = panel.modbus?.status ?? 'closed'
  const lastError = panel.modbus?.lastError
  if (status === 'open') {
    return (
      <Badge variant="secondary" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        已连接
      </Badge>
    )
  }
  if (status === 'opening') {
    return (
      <Badge variant="secondary" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600">
        <CircleNotch className="size-3 animate-spin" />
        连接中…
      </Badge>
    )
  }
  if (status === 'error') {
    const text = truncateError(lastError)
    return (
      <Badge variant="destructive" className="gap-1" title={lastError}>
        <Warning className="size-3" />
        <span className="max-w-40 truncate">{text}</span>
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      未连接
    </Badge>
  )
}

interface ModbusConnectBarProps {
  panel: Panel
}

/**
 * Modbus 连接栏：变体选择 + 连接参数 + 连接/断开按钮 + 状态徽章。
 * 未连接时字段可编辑；已连接时只读并显示断开按钮。
 * TCP 显示主机/端口；RTU/ASCII 显示串口路径及波特率/数据位/停止位/校验。
 */
export default function ModbusConnectBar({ panel }: ModbusConnectBarProps) {
  const knownPorts = usePanelsStore((s) => s.knownPorts)
  const setModbusConnectOptions = usePanelsStore((s) => s.setModbusConnectOptions)
  const togglePanelOpen = usePanelsStore((s) => s.togglePanelOpen)

  const connectOptions = panel.modbus?.connectOptions
  const variant = connectOptions?.variant ?? 'tcp'
  const tcpHost = connectOptions?.tcpHost ?? ''
  const tcpPort = connectOptions?.tcpPort ?? 502
  const serialPath = connectOptions?.serialPath ?? ''
  const baudRate = connectOptions?.baudRate ?? (variant === 'ascii' ? 19200 : 9600)
  const dataBits = connectOptions?.dataBits ?? (variant === 'ascii' ? 7 : 8)
  const stopBits = connectOptions?.stopBits ?? 1
  const parity = connectOptions?.parity ?? (variant === 'ascii' ? 'even' : 'none')
  const connected = panel.open
  const disabled = connected

  // 本地输入草稿（受控 host 文本，避免每次按键直接触发持久化往返抖动）
  const [hostDraft, setHostDraft] = useState(tcpHost)

  function patch(p: Partial<ModbusConnectOptions>) {
    setModbusConnectOptions(panel.id, { ...connectOptions!, ...p })
  }

  function commitVariant(v: ModbusVariant) {
    // 切换变体时填充该变体的默认串口参数（仅当未显式设置时）
    if (v === 'rtu') {
      patch({ variant: v, baudRate: baudRate ?? 9600, dataBits: dataBits ?? 8, stopBits: stopBits ?? 1, parity: parity ?? 'none' })
    } else if (v === 'ascii') {
      patch({ variant: v, baudRate: baudRate ?? 19200, dataBits: dataBits ?? 7, stopBits: stopBits ?? 1, parity: parity ?? 'even' })
    } else {
      patch({ variant: v })
    }
  }

  function commitHost() {
    if (hostDraft === tcpHost) return
    patch({ tcpHost: hostDraft })
  }

  function commitPort(v: string) {
    const port = Number(v)
    if (!Number.isFinite(port)) return
    patch({ tcpPort: port })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
      {/* 变体选择 */}
      <div className="flex items-center gap-1.5">
        <Label className="text-muted-foreground">类型</Label>
        <Select
          value={variant}
          onValueChange={(v) => commitVariant(v as ModbusVariant)}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="h-7 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tcp">TCP</SelectItem>
            <SelectItem value="rtu">{VARIANT_LABELS.rtu}</SelectItem>
            <SelectItem value="ascii">{VARIANT_LABELS.ascii}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TCP 参数 */}
      {variant === 'tcp' && (
        <div className="flex items-center gap-1.5">
          <Label className="text-muted-foreground">主机</Label>
          <Input
            className="h-7 w-36 text-xs"
            value={connected ? tcpHost : hostDraft}
            disabled={disabled}
            placeholder="127.0.0.1"
            onChange={(e) => setHostDraft(e.target.value)}
            onBlur={commitHost}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <Label className="text-muted-foreground">端口</Label>
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            value={tcpPort}
            disabled={disabled}
            min={1}
            max={65535}
            onChange={(e) => commitPort(e.target.value)}
          />
        </div>
      )}

      {/* RTU/ASCII 串口参数 */}
      {(variant === 'rtu' || variant === 'ascii') && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-muted-foreground">串口</Label>
            <Select
              value={serialPath}
              onValueChange={(v) => patch({ serialPath: v })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-7 w-40">
                <SelectValue placeholder={knownPorts.length ? '选择串口' : '无可用串口'} />
              </SelectTrigger>
              <SelectContent>
                {knownPorts.map((p) => (
                  <SelectItem key={p.path} value={p.path}>
                    {p.friendlyName ? `${p.path} (${p.friendlyName})` : p.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* 当所选路径不在已知列表时，提供手动输入回退 */}
            {serialPath && !knownPorts.some((p) => p.path === serialPath) && (
              <Input
                className="h-7 w-40 text-xs"
                value={serialPath}
                disabled={disabled}
                onChange={(e) => patch({ serialPath: e.target.value })}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-muted-foreground">波特率</Label>
            <Select
              value={String(baudRate)}
              onValueChange={(v) => patch({ baudRate: Number(v) })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-7 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-muted-foreground">数据位</Label>
            <Select
              value={String(dataBits)}
              onValueChange={(v) => patch({ dataBits: Number(v) as 7 | 8 })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-7 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7</SelectItem>
                <SelectItem value="8">8</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-muted-foreground">停止位</Label>
            <Select
              value={String(stopBits)}
              onValueChange={(v) => patch({ stopBits: Number(v) as 1 | 2 })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-7 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-muted-foreground">校验</Label>
            <Select
              value={parity}
              onValueChange={(v) => patch({ parity: v as (typeof SERIAL_PARITIES)[number] })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-7 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERIAL_PARITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <StatusBadge panel={panel} />
        <Button
          size="sm"
          variant={connected ? 'destructive' : 'default'}
          disabled={panel.modbus?.status === 'opening'}
          onClick={() => togglePanelOpen(panel.id)}
        >
          {connected ? <X /> : <Plug />}
          {connected ? '断开' : '连接'}
        </Button>
      </div>
    </div>
  )
}
