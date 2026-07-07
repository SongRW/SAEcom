import { useRef, useState } from 'react'
import {
  Plus,
  ArrowsClockwise,
  Pause,
  PencilSimple,
  UploadSimple,
  DownloadSimple,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { ModbusBlock } from '@shared/types'
import type { Panel } from '@/features/serial-panel/types'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useIPC } from '@/shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ModbusConnectBar from './components/ModbusConnectBar'
import ModbusManualDrawer from './components/ModbusManualDrawer'
import ModbusBlockTable from './components/ModbusBlockTable'
import { parseBlocksCsv, serializeBlocksCsv } from './csv'

/** 功能码选项：值 → 中文标签 */
const FC_OPTIONS = [
  { value: '1', label: '线圈' },
  { value: '2', label: '离散输入' },
  { value: '3', label: '保持寄存器' },
  { value: '4', label: '输入寄存器' },
] as const

/** 显示格式选项 */
const FORMAT_OPTIONS: { value: ModbusBlock['displayFormat']; label: string }[] = [
  { value: 'signed', label: 'signed' },
  { value: 'unsigned', label: 'unsigned' },
  { value: 'hex', label: 'hex' },
  { value: 'binary', label: 'binary' },
  { value: 'float32', label: 'float32' },
  { value: 'float32-swapped', label: 'float32-swapped' },
  { value: 'float32-byte', label: 'float32-byte' },
  { value: 'float32-word-byte', label: 'float32-word-byte' },
]

/** 区块编辑表单草稿 */
interface BlockDraft {
  id?: string
  title: string
  slaveId: string
  functionCode: string
  startAddress: string
  quantity: string
  displayFormat: ModbusBlock['displayFormat']
  pollIntervalMs: string
  pollEnabled: boolean
}

function emptyDraft(): BlockDraft {
  return {
    title: '',
    slaveId: '1',
    functionCode: '3',
    startAddress: '0',
    quantity: '1',
    displayFormat: 'unsigned',
    pollIntervalMs: '1000',
    pollEnabled: true,
  }
}

function blockToDraft(b: ModbusBlock): BlockDraft {
  return {
    id: b.id,
    title: b.title ?? '',
    slaveId: String(b.slaveId),
    functionCode: String(b.functionCode),
    startAddress: String(b.startAddress),
    quantity: String(b.quantity),
    displayFormat: b.displayFormat,
    pollIntervalMs: String(b.pollIntervalMs),
    pollEnabled: b.pollEnabled,
  }
}

function genBlockId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10)
}

interface ModbusPanelBodyProps {
  panel: Panel
}

/**
 * Modbus 面板主体：连接栏 + 工具栏 + 区块列表 + 区块编辑对话框 + 手动读写抽屉。
 * 由 FloatingPane 在 panel.type === 'modbus' 时挂载，填满 pane body。
 */
export function ModbusPanelBody({ panel }: ModbusPanelBodyProps) {
  const ipc = useIPC()
  const setModbusBlocks = usePanelsStore((s) => s.setModbusBlocks)
  const updateModbusBlockValue = usePanelsStore((s) => s.updateModbusBlockValue)

  const blocks = panel.modbus?.blocks ?? []
  const blockValues = panel.modbus?.blockValues ?? {}

  const [manualOpen, setManualOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<BlockDraft>(emptyDraft)
  const [refreshingAll, setRefreshingAll] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function openAdd() {
    setDraft(emptyDraft())
    setEditOpen(true)
  }

  function openEdit(b: ModbusBlock) {
    setDraft(blockToDraft(b))
    setEditOpen(true)
  }

  function commitDraft() {
    const slaveId = Number(draft.slaveId)
    const functionCode = Number(draft.functionCode) as 1 | 2 | 3 | 4
    const startAddress = Number(draft.startAddress)
    const quantity = Number(draft.quantity)
    const pollIntervalMs = Number(draft.pollIntervalMs)
    if (![slaveId, functionCode, startAddress, quantity, pollIntervalMs].every(Number.isFinite)) {
      toast.error('参数无效：请输入有效的数字')
      return
    }
    const block: ModbusBlock = {
      id: draft.id ?? genBlockId(),
      title: draft.title.trim() || undefined,
      slaveId,
      functionCode,
      startAddress,
      quantity,
      pollEnabled: draft.pollEnabled,
      pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 1000,
      displayFormat: draft.displayFormat,
    }
    const next = draft.id
      ? blocks.map((b) => (b.id === draft.id ? block : b))
      : [...blocks, block]
    setModbusBlocks(panel.id, next)
    setEditOpen(false)
  }

  function deleteBlock(blockId: string) {
    setModbusBlocks(panel.id, blocks.filter((b) => b.id !== blockId))
  }

  async function refreshAll() {
    if (refreshingAll) return
    setRefreshingAll(true)
    try {
      await Promise.all(
        blocks.map(async (b) => {
          try {
            const res = await ipc.modbus.read(
              panel.id,
              b.slaveId,
              b.functionCode,
              b.startAddress,
              b.quantity,
            )
            updateModbusBlockValue(panel.id, b.id, res.values, Date.now(), res.error)
          } catch (e) {
            updateModbusBlockValue(
              panel.id,
              b.id,
              [],
              Date.now(),
              e instanceof Error ? e.message : String(e),
            )
          }
        }),
      )
    } finally {
      setRefreshingAll(false)
    }
  }

  function pauseAllPolls() {
    setModbusBlocks(panel.id, blocks.map((b) => ({ ...b, pollEnabled: false })))
  }

  function triggerImport() {
    fileInputRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 清空 value 以便同一文件可再次触发 change
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseBlocksCsv(text)
      setModbusBlocks(panel.id, [...blocks, ...parsed])
      const skipped = text.split(/\r?\n/).filter((l) => l.trim()).length - 1 - parsed.length
      toast.success(`已导入 ${parsed.length} 个区块` + (skipped > 0 ? `，跳过 ${skipped} 行` : ''))
    }
    reader.onerror = () => toast.error('读取文件失败')
    reader.readAsText(file)
  }

  function exportMap() {
    if (blocks.length === 0) {
      toast.error('暂无区块可导出')
      return
    }
    const csv = serializeBlocksCsv(blocks)
    const name = (panel.note || panel.name) + '-modbus-map.csv'
    void ipc.panel.saveLog(name, csv)
  }

  return (
    <div className="flex h-full flex-col">
      <ModbusConnectBar panel={panel} />

      {/* 工具栏 */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5 text-xs">
        <Button size="xs" variant="outline" onClick={openAdd}>
          <Plus />
          新增区块
        </Button>
        <Button size="xs" variant="outline" onClick={() => setManualOpen(true)}>
          <ArrowsClockwise />
          手动读写…
        </Button>
        <Button size="xs" variant="outline" onClick={refreshAll} disabled={refreshingAll}>
          <ArrowsClockwise className={refreshingAll ? 'animate-spin' : undefined} />
          全部刷新
        </Button>
        <Button size="xs" variant="outline" onClick={pauseAllPolls} disabled={blocks.length === 0}>
          <Pause />
          暂停所有轮询
        </Button>
        <div className="flex-1" />
        <Button size="xs" variant="ghost" onClick={triggerImport}>
          <UploadSimple />
          导入映射
        </Button>
        <Button size="xs" variant="ghost" onClick={exportMap}>
          <DownloadSimple />
          导出映射
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {/* 区块列表 */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {blocks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            暂无区块，点击「+ 新增区块」或「导入映射」开始
          </div>
        ) : (
          blocks.map((b) => (
            <ModbusBlockTable
              key={b.id}
              panelId={panel.id}
              block={b}
              value={blockValues[b.id]}
              onEdit={openEdit}
              onDelete={deleteBlock}
            />
          ))
        )}
      </div>

      <ModbusManualDrawer panel={panel} open={manualOpen} onOpenChange={setManualOpen} />

      {/* 区块编辑/新增对话框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? '编辑区块' : '新增区块'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">标题（可选）</Label>
              <Input
                className="h-7 text-xs"
                value={draft.title}
                placeholder={`从站${draft.slaveId} FC${draft.functionCode}`}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">从站 ID</Label>
              <Input
                type="number"
                min={1}
                max={247}
                className="h-7 text-xs"
                value={draft.slaveId}
                onChange={(e) => setDraft({ ...draft, slaveId: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">功能码</Label>
              <Select
                value={draft.functionCode}
                onValueChange={(v) => setDraft({ ...draft, functionCode: v })}
              >
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FC_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">起始地址</Label>
              <Input
                type="number"
                min={0}
                max={65535}
                className="h-7 text-xs"
                value={draft.startAddress}
                onChange={(e) => setDraft({ ...draft, startAddress: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">数量</Label>
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
              />
            </div>

            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">显示格式</Label>
              <Select
                value={draft.displayFormat}
                onValueChange={(v) =>
                  setDraft({ ...draft, displayFormat: v as ModbusBlock['displayFormat'] })
                }
              >
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">轮询间隔 (ms)</Label>
              <Input
                type="number"
                min={50}
                className="h-7 text-xs"
                value={draft.pollIntervalMs}
                onChange={(e) => setDraft({ ...draft, pollIntervalMs: e.target.value })}
              />
            </div>

            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id={`poll-enabled-${draft.id ?? 'new'}`}
                checked={draft.pollEnabled}
                onCheckedChange={(v) => setDraft({ ...draft, pollEnabled: v === true })}
              />
              <Label htmlFor={`poll-enabled-${draft.id ?? 'new'}`} className="text-xs">
                启用轮询
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={commitDraft}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ModbusPanelBody
