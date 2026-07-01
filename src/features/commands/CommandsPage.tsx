import { useEffect, useRef, useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { CommandGrid } from '@/features/commands/components/CommandGrid'
import { CommandEditor } from '@/features/commands/components/CommandEditor'
import { useCommandsStore, type Command } from '@/features/commands/store'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useSettingsStore } from '@/shared/store/settings'
import { useIPC } from '@/shared/ipc'
import { routeWrite, RepeatManager, shouldEcho } from '@/features/commands/sendCommand'
import { nowTs } from '@/features/serial-panel/paneViewModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

/**
 * 命令页容器。镜像 legacy #page-commands + sendCommand（renderer.js:3551）。
 * - 读 panels.activeId + panels.panels[id] 拿 type/open。
 * - routeWrite 按 type 路由 serial/tcp.write，编码跟随设置，echo 回显。
 * - 重复发送：repeat toggle + repeatMs，RepeatManager 管 per-cmd interval。
 */
export function CommandsPage() {
  const ipc = useIPC()
  const load = useCommandsStore((s) => s.load)
  const txTimestamp = useSettingsStore((s) => s.txTimestamp)
  const charEncoding = useSettingsStore((s) => s.charEncoding)
  const [editorOpen, setEditorOpen] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [repeatMs, setRepeatMs] = useState('1000')
  // repeatTick：repeaters 是 ref，内部 Map 变化不会触发渲染；
  // 在 toggle/clearAll 后 bump 它，让传给 CommandGrid 的 isRepeatActive 回调闭包刷新。
  const [repeatTick, setRepeatTick] = useState(0)
  const repeaters = useRef(new RepeatManager()).current

  useEffect(() => {
    load()
  }, [load])

  // 卸载时清空所有重复发送
  useEffect(() => () => repeaters.clearAll(), [repeaters])

  /** 单次发送到当前活动面板。返回是否成功（供 RepeatManager 连续失败计数）。 */
  async function sendOnce(cmd: Command): Promise<boolean> {
    // 空命令守卫：避免向端口发送空帧（尤其是 append 模式下只发结尾字符）。
    if (!cmd.data || !cmd.data.trim()) {
      toast.warning('命令为空')
      return false
    }
    // 每次现读活动面板（不闭包捕获渲染时的 activeId）：sendOnce 同时服务单次与重复发送，
    // 重复发送的 interval 回调会长期复用本函数，若捕获渲染时的 id 会冻结到旧面板，
    // 用户切换面板后重复发送仍发往旧面板（review 第 4 项）。
    const id = usePanelsStore.getState().activeId
    if (!id) {
      toast.warning('请先选择一个面板')
      return false
    }
    const panel = usePanelsStore.getState().panels[id]
    if (!panel) {
      toast.warning('面板不存在')
      return false
    }
    const append = panel.sendOptions?.append ?? 'CRLF'
    const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', append, charEncoding || 'utf-8')
    if (!res.ok) {
      toast.error('发送失败：' + (res.error || ''))
      return false
    }
    // 回显跟随每面板的 echoSend（对齐 SendBar），而非默认关闭的全局开关，否则命令发出但不回显。
    if (shouldEcho(panel)) {
      const ts = txTimestamp !== false ? `[${nowTs()}] ` : ''
      usePanelsStore.getState().appendChunk(id, {
        text: ts + (cmd.data || '') + '\n',
        hex: ts + (cmd.data || '') + '\n',
        isEcho: true
      })
    }
    return true
  }

  /** 点击命令卡片：repeat 开 → toggle 重复；否则单次 */
  function handleSend(cmd: Command) {
    if (repeat) {
      const ms = parseInt(repeatMs || '1000', 10)
      repeaters.toggle(cmd.id, ms, () => sendOnce(cmd))
      setRepeatTick((n) => n + 1) // 刷新 CommandGrid 的 isRepeatActive 高亮
    } else {
      void sendOnce(cmd)
    }
  }

  function toggleRepeat() {
    const next = !repeat
    setRepeat(next)
    if (!next) repeaters.clearAll()
    setRepeatTick((n) => n + 1)
  }

  return (
    <div className="relative h-full">
      <CommandGrid
        onSend={handleSend}
        onEdit={() => setEditorOpen(true)}
        isRepeatActive={(cmdId) => {
          void repeatTick // toggle/clearAll 后触发重渲染
          return repeaters.isActive(cmdId)
        }}
        repeatBar={
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant={repeat ? 'default' : 'outline'}
              size="sm"
              className="h-7"
              onClick={toggleRepeat}
              title={repeat ? '关闭重复发送' : '开启重复发送'}
            >
              <ArrowsClockwise data-icon="inline-start" />
              {repeat ? '重复中' : '重复发送'}
            </Button>
            <Input
              type="number"
              value={repeatMs}
              onChange={(e) => setRepeatMs(e.target.value)}
              className="h-7 w-24"
              disabled={!repeat}
            />
            <span className="text-muted-foreground">ms</span>
          </div>
        }
      />
      <CommandEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  )
}
