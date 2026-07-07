import { useState } from 'react'
import { Plug, X, CircleNotch, Warning } from '@phosphor-icons/react'
import type { ModbusVariant } from '@shared/types'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const VARIANT_LABELS: Record<ModbusVariant, string> = {
  tcp: 'TCP',
  rtu: 'RTU',
  ascii: 'ASCII',
}

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
 * RTU/ASCII 为阶段 3 支持，目前禁用（仅 TCP 可选）。
 */
export default function ModbusConnectBar({ panel }: ModbusConnectBarProps) {
  const setModbusConnectOptions = usePanelsStore((s) => s.setModbusConnectOptions)
  const togglePanelOpen = usePanelsStore((s) => s.togglePanelOpen)

  const connectOptions = panel.modbus?.connectOptions
  const variant = connectOptions?.variant ?? 'tcp'
  const tcpHost = connectOptions?.tcpHost ?? ''
  const tcpPort = connectOptions?.tcpPort ?? 502
  const connected = panel.open
  const disabled = connected

  // 本地输入草稿（受控 host 文本，避免每次按键直接触发持久化往返抖动）
  const [hostDraft, setHostDraft] = useState(tcpHost)

  function commitVariant(v: ModbusVariant) {
    setModbusConnectOptions(panel.id, { ...connectOptions!, variant: v })
  }

  function commitHost() {
    if (hostDraft === tcpHost) return
    setModbusConnectOptions(panel.id, { ...connectOptions!, tcpHost: hostDraft })
  }

  function commitPort(v: string) {
    const port = Number(v)
    if (!Number.isFinite(port)) return
    setModbusConnectOptions(panel.id, { ...connectOptions!, tcpPort: port })
  }

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
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
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span 包裹以承接禁用项的 hover（SelectItem disabled 不触发 onSelect） */}
                <span>
                  <SelectItem value="rtu" disabled>
                    {VARIANT_LABELS.rtu}
                  </SelectItem>
                </span>
              </TooltipTrigger>
              <TooltipContent>阶段 3 支持</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <SelectItem value="ascii" disabled>
                    {VARIANT_LABELS.ascii}
                  </SelectItem>
                </span>
              </TooltipTrigger>
              <TooltipContent>阶段 3 支持</TooltipContent>
            </Tooltip>
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
