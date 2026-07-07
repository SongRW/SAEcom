import { useState } from 'react'
import {
  Play,
  Pause,
  ArrowsClockwise,
  Trash,
  PencilSimple,
  CaretDown,
  CaretRight,
  Warning,
} from '@phosphor-icons/react'
import type { ModbusBlock } from '@shared/types'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  modbusAddressLabel,
  formatCellDisplay,
  decodeRegisterValue,
} from '../format'

interface ModbusBlockValue {
  values: number[]
  ts: number
  error?: string
}

interface ModbusBlockTableProps {
  panelId: string
  block: ModbusBlock
  value?: ModbusBlockValue
  onEdit?: (block: ModbusBlock) => void
  onDelete?: (blockId: string) => void
}

const FLOAT32_FORMATS = ['float32', 'float32-swapped', 'float32-byte', 'float32-word-byte'] as const
type Float32Format = typeof FLOAT32_FORMATS[number]
type SingleFormat = 'signed' | 'unsigned' | 'hex' | 'binary'

function isFloat32(f: ModbusBlock['displayFormat']): f is Float32Format {
  return f.startsWith('float32')
}

function timeLabel(ts?: number): string {
  if (!ts) return '—'
  const t = new Date(ts)
  return `${t.toLocaleTimeString('zh-CN', { hour12: false })}.${String(ts % 1000).padStart(3, '0')}`
}

export default function ModbusBlockTable({
  panelId,
  block,
  value,
  onEdit,
  onDelete,
}: ModbusBlockTableProps) {
  const ipc = useIPC()
  const blocks = usePanelsStore((s) => s.panels[panelId]?.modbus?.blocks ?? [])
  const setModbusBlocks = usePanelsStore((s) => s.setModbusBlocks)
  const updateModbusBlockValue = usePanelsStore((s) => s.updateModbusBlockValue)

  const [open, setOpen] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const float = isFloat32(block.displayFormat)
  const writable = block.functionCode === 3 && !float

  const handlePollToggle = () => {
    setModbusBlocks(
      panelId,
      blocks.map((b) => (b.id === block.id ? { ...b, pollEnabled: !b.pollEnabled } : b)),
    )
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await ipc.modbus.read(
        panelId,
        block.slaveId,
        block.functionCode,
        block.startAddress,
        block.quantity,
      )
      updateModbusBlockValue(panelId, block.id, res.values, Date.now(), res.error)
    } catch (e) {
      updateModbusBlockValue(panelId, block.id, [], Date.now(), e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const startEdit = (rowIndex: number, current: string) => {
    if (!writable) return
    setEditingRow(rowIndex)
    setEditValue(current)
  }

  const commitEdit = async (rowIndex: number) => {
    const v = Number(editValue)
    setEditingRow(null)
    if (!Number.isFinite(v)) return
    try {
      await ipc.modbus.write(panelId, {
        slaveId: block.slaveId,
        functionCode: 6,
        startAddress: block.startAddress + rowIndex,
        values: [v],
      })
      await handleRefresh()
    } catch {
      /* write 失败由 refresh 状态体现 */
    }
  }

  // 构建表格行：float32 每 2 寄存器一行，其余每寄存器一行
  const rowCount = float ? Math.floor(block.quantity / 2) : block.quantity
  const rows: { addr: string; val: string }[] = []
  for (let i = 0; i < rowCount; i++) {
    const vals = value?.values ?? []
    if (float) {
      const pair = vals.slice(i * 2, i * 2 + 2)
      rows.push({
        addr: modbusAddressLabel(block.functionCode, block.startAddress + i * 2),
        val: decodeRegisterValue(pair, block.displayFormat as Float32Format),
      })
    } else {
      rows.push({
        addr: modbusAddressLabel(block.functionCode, block.startAddress + i),
        val: formatCellDisplay([vals[i] ?? 0], block.displayFormat as SingleFormat),
      })
    }
  }

  const subtitle = `从站:${block.slaveId} FC${block.functionCode} 起始:${block.startAddress} 数量:${block.quantity} ${block.displayFormat}`

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-card">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="shrink-0">
            {open ? <CaretDown /> : <CaretRight />}
          </Button>
        </CollapsibleTrigger>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {block.title || `从站${block.slaveId} FC${block.functionCode}`}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handlePollToggle}
            title={block.pollEnabled ? '暂停轮询' : '开始轮询'}
          >
            {block.pollEnabled ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRefresh}
            disabled={refreshing}
            title="立即刷新"
          >
            <ArrowsClockwise className={refreshing ? 'animate-spin' : undefined} />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onEdit?.(block)} title="编辑区块">
            <PencilSimple />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete?.(block.id)}
            title="删除区块"
          >
            <Trash />
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <table className="w-full text-xs">
          <thead className="text-[10px] text-muted-foreground">
            <tr className="border-t">
              <th className="px-2 py-1 text-left font-medium">地址</th>
              <th className="px-2 py-1 text-left font-medium">值</th>
              <th className="px-2 py-1 text-left font-medium">格式</th>
              <th className="px-2 py-1 text-left font-medium">上次更新</th>
              <th className="px-2 py-1 text-left font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {value?.error ? (
              <tr>
                <td colSpan={5} className="px-2 py-1 text-destructive">{value.error}</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-2 py-1 font-mono">{r.addr}</td>
                  <td className="px-2 py-1 font-mono">
                    {writable && editingRow === i ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => setEditingRow(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(i)
                          else if (e.key === 'Escape') setEditingRow(null)
                        }}
                        className="w-24 rounded border border-input bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEdit(i, r.val)}
                        className={writable ? 'cursor-text' : undefined}
                      >
                        {r.val}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{block.displayFormat}</td>
                  <td className="px-2 py-1 font-mono text-muted-foreground">{timeLabel(value?.ts)}</td>
                  <td className="px-2 py-1">
                    {value?.error ? (
                      <span title={value.error}>
                        <Warning className="size-3.5 text-amber-500" />
                      </span>
                    ) : value?.ts ? (
                      <span className="text-emerald-500">✓</span>
                    ) : (
                      <span className="text-muted-foreground">○</span>
                    )}
                  </td>
                </tr>
              ))
            )}
            {rows.length === 0 && !value?.error && (
              <tr>
                <td colSpan={5} className="px-2 py-1 text-muted-foreground">暂无数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  )
}
