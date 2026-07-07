import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePanelsStore } from '@/features/serial-panel/store'
import { DEFAULT_SERIAL_OPTIONS } from '@/features/serial-panel/paneViewModel'
import { toast } from 'sonner'

interface NewPanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const DATA_BITS = [5, 6, 7, 8]
const STOP_BITS = [1, 2]
const PARITIES = ['none', 'even', 'odd', 'mark', 'space'] as const

/**
 * 新建面板弹窗。镜像 legacy #dlgNew：选串口+参数 / TCP host:port。
 * 确认后调 store.addPanel 创建浮动面板。
 */
export function NewPanelDialog({ open, onOpenChange }: NewPanelDialogProps) {
  const knownPorts = usePanelsStore((s) => s.knownPorts)
  const addPanel = usePanelsStore((s) => s.addPanel)
  const [mode, setMode] = useState<'serial' | 'tcp' | 'modbus'>('serial')
  const [port, setPort] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [tcpPort, setTcpPort] = useState('8080')
  const [modbusHost, setModbusHost] = useState('127.0.0.1')
  const [modbusPort, setModbusPort] = useState('502')
  const [baud, setBaud] = useState(String(DEFAULT_SERIAL_OPTIONS.baudRate))
  const [dataBits, setDataBits] = useState(String(DEFAULT_SERIAL_OPTIONS.dataBits))
  const [stopBits, setStopBits] = useState(String(DEFAULT_SERIAL_OPTIONS.stopBits))
  const [parity, setParity] = useState<string>(DEFAULT_SERIAL_OPTIONS.parity)

  function handleConfirm() {
    let ok = true
    if (mode === 'serial') {
      if (!port) return
      // name 用 friendlyName（无则回退 path），对齐 legacy createPane 用友好名展示。
      const known = knownPorts.find((p) => p.path === port)
      const name = known?.friendlyName || known?.manufacturer || port
      ok = addPanel({
        id: port,
        name,
        type: 'serial',
        options: {
          baudRate: Number(baud),
          dataBits: Number(dataBits),
          stopBits: Number(stopBits),
          parity: parity as (typeof PARITIES)[number]
        }
      })
    } else if (mode === 'tcp') {
      const id = `tcp://${host}:${tcpPort}`
      ok = addPanel({ id, name: id, type: 'tcp' })
    } else if (mode === 'modbus') {
      if (!modbusHost) return
      const portNum = Number(modbusPort)
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) return
      const id = `modbus://tcp/${modbusHost}:${portNum}`
      ok = addPanel({
        id,
        name: id,
        type: 'modbus',
        modbus: {
          connectOptions: { variant: 'tcp', tcpHost: modbusHost, tcpPort: portNum },
          blocks: [],
          status: 'closed',
          blockValues: {},
        },
      })
    }
    // 超出 MAX_PANELS 上限：不关弹窗，提示用户
    if (!ok) { toast.error('面板数已达上限（64）') }
    else { onOpenChange(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建面板</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button variant={mode === 'serial' ? 'default' : 'outline'} size="sm" onClick={() => setMode('serial')}>
            串口
          </Button>
          <Button variant={mode === 'tcp' ? 'default' : 'outline'} size="sm" onClick={() => setMode('tcp')}>
            TCP
          </Button>
          <Button variant={mode === 'modbus' ? 'default' : 'outline'} size="sm" onClick={() => setMode('modbus')}>
            Modbus
          </Button>
        </div>

        {mode === 'serial' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>串口</Label>
              <Select value={port} onValueChange={setPort}>
                <SelectTrigger>
                  <SelectValue placeholder="选择串口" />
                </SelectTrigger>
                <SelectContent>
                  {knownPorts.map((p) => (
                    <SelectItem key={p.path} value={p.path}>
                      {p.friendlyName ? `${p.path} (${p.friendlyName})` : p.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>波特率</Label>
                <Select value={baud} onValueChange={setBaud}>
                  <SelectTrigger>
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
              <div className="flex flex-col gap-1.5">
                <Label>数据位</Label>
                <Select value={dataBits} onValueChange={setDataBits}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_BITS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>停止位</Label>
                <Select value={stopBits} onValueChange={setStopBits}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOP_BITS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>校验</Label>
                <Select value={parity} onValueChange={setParity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : mode === 'tcp' ? (
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>主机</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>端口</Label>
              <Input className="w-24" value={tcpPort} onChange={(e) => setTcpPort(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>Modbus TCP</Label>
                <Input value={modbusHost} onChange={(e) => setModbusHost(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>端口</Label>
                <Input className="w-24" value={modbusPort} onChange={(e) => setModbusPort(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">RTU/ASCII 将在后续版本支持</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
