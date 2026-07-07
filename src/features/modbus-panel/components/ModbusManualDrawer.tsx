import { useState } from 'react'
import { Play, ArrowRight } from '@phosphor-icons/react'
import type { Panel } from '@/features/serial-panel/types'
import type { ModbusWriteTarget } from '@shared/types'
import { useIPC } from '@/shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Mode = 'read' | 'write'

/** 读功能码：线圈/离散输入/保持寄存器/输入寄存器 */
const READ_FCS = [
  { value: '1', label: 'FC1 线圈' },
  { value: '2', label: 'FC2 离散输入' },
  { value: '3', label: 'FC3 保持寄存器' },
  { value: '4', label: 'FC4 输入寄存器' },
] as const

/** 写功能码：单线圈/单寄存器/多线圈/多寄存器 */
const WRITE_FCS = [
  { value: '5', label: 'FC5 单线圈' },
  { value: '6', label: 'FC6 单寄存器' },
  { value: '15', label: 'FC15 多线圈' },
  { value: '16', label: 'FC16 多寄存器' },
] as const

interface ModbusManualDrawerProps {
  panel: Panel
  open: boolean
  onOpenChange: (v: boolean) => void
}

/**
 * 手动读写抽屉：右侧 Sheet，支持 read（FC1~4）/ write（FC5/6/15/16）。
 * 通过 ipc.modbus.read/write 直接发起单次操作，结果展示在底部。
 */
export default function ModbusManualDrawer({
  panel,
  open,
  onOpenChange,
}: ModbusManualDrawerProps) {
  const ipc = useIPC()

  const [mode, setMode] = useState<Mode>('read')
  const [slaveId, setSlaveId] = useState('1')
  const [readFc, setReadFc] = useState<string>('3')
  const [writeFc, setWriteFc] = useState<string>('6')
  const [startAddress, setStartAddress] = useState('0')
  const [quantity, setQuantity] = useState('1')
  const [valuesStr, setValuesStr] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  function resetResult() {
    setResult(null)
    setError(null)
  }

  function toNum(s: string, fallback = NaN): number {
    const n = s.trim() === '' ? fallback : Number(s)
    return Number.isFinite(n) ? n : NaN
  }

  async function handleRead() {
    const sid = toNum(slaveId)
    const fc = toNum(readFc)
    const addr = toNum(startAddress)
    const qty = toNum(quantity)
    if ([sid, fc, addr, qty].some((n) => !Number.isFinite(n))) {
      resetResult()
      setError('参数无效：请输入有效的数字')
      return
    }
    setRunning(true)
    try {
      const res = await ipc.modbus.read(
        panel.id,
        sid,
        fc as 1 | 2 | 3 | 4,
        addr,
        qty,
      )
      resetResult()
      if (res.error) setError(res.error)
      else setResult(res.values.join(', '))
    } catch (e) {
      resetResult()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  async function handleWrite() {
    const sid = toNum(slaveId)
    const fc = toNum(writeFc)
    const addr = toNum(startAddress)
    if ([sid, fc, addr].some((n) => !Number.isFinite(n))) {
      resetResult()
      setError('参数无效：请输入有效的数字')
      return
    }
    // 解析逗号分隔的数值
    const values = valuesStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => Number(s))
    if (values.length === 0 || values.some((v) => !Number.isFinite(v))) {
      resetResult()
      setError('写入值无效：请输入逗号分隔的数字')
      return
    }
    const target: ModbusWriteTarget = {
      slaveId: sid,
      functionCode: fc as 5 | 6 | 15 | 16,
      startAddress: addr,
      values,
    }
    setRunning(true)
    try {
      const res = await ipc.modbus.write(panel.id, target)
      resetResult()
      if (res.ok) setResult('写入成功')
      else setError(res.error || '写入失败')
    } catch (e) {
      resetResult()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 gap-0 sm:max-w-80">
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm">手动读写</SheetTitle>
          <SheetDescription className="text-xs">
            {panel.name} · 直接发起单次 Modbus 读/写操作
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          {/* 模式切换 */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
            {(['read', 'write'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  resetResult()
                }}
                className={
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors ' +
                  (mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {m === 'read' ? '读取' : '写入'}
              </button>
            ))}
          </div>

          {/* 通用参数 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">从站 ID</Label>
              <Input
                className="h-7 text-xs"
                value={slaveId}
                onChange={(e) => setSlaveId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">起始地址</Label>
              <Input
                className="h-7 text-xs"
                value={startAddress}
                onChange={(e) => setStartAddress(e.target.value)}
              />
            </div>
          </div>

          {/* 模式专属参数 */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">功能码</Label>
            {mode === 'read' ? (
              <Select value={readFc} onValueChange={setReadFc}>
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {READ_FCS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={writeFc} onValueChange={setWriteFc}>
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WRITE_FCS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {mode === 'read' ? (
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">数量</Label>
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">
                写入值（逗号分隔）
              </Label>
              <Input
                className="h-7 text-xs"
                placeholder="1, 0, 255"
                value={valuesStr}
                onChange={(e) => setValuesStr(e.target.value)}
              />
            </div>
          )}

          <Button
            size="sm"
            disabled={running}
            onClick={mode === 'read' ? handleRead : handleWrite}
          >
            {running ? <ArrowRight className="animate-pulse" /> : <Play />}
            执行{mode === 'read' ? '读取' : '写入'}
          </Button>

          {/* 结果区 */}
          {(result !== null || error !== null) && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs">
              <div className="mb-1 font-medium text-muted-foreground">结果</div>
              {error ? (
                <div className="break-all text-destructive">{error}</div>
              ) : (
                <div className="break-all font-mono">{result}</div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
