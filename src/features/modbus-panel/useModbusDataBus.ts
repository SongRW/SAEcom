import { useEffect } from 'react'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'

/**
 * 监听 modbus:data / modbus:event，路由到 panels store。
 *
 * 与 serial/tcp 的 useSerialDataBus（dataBus.ts）对称：
 * - modbus:data → updateModbusBlockValue（区块值缓存）
 * - modbus:event → setModbusStatus + setPaneOpen（连接状态 + 开关标志）
 *   后者与 dataBus.ts:114/117/137/140 的 serial/tcp 'open'/'close' → setPaneOpen 一致，
 *   因为 store.togglePanelOpen 的 close 路径只调 IPC，open 状态由事件回调驱动。
 */
export function useModbusDataBus() {
  const ipc = useIPC()
  const updateModbusBlockValue = usePanelsStore((s) => s.updateModbusBlockValue)
  const setModbusStatus = usePanelsStore((s) => s.setModbusStatus)
  const setPaneOpen = usePanelsStore((s) => s.setPaneOpen)

  useEffect(() => {
    const offData = ipc.modbus.onData((u) => {
      updateModbusBlockValue(u.panelId, u.blockId, u.values, u.ts, u.error)
    })
    const offEvent = ipc.modbus.onEvent((e) => {
      if (e.type === 'open') {
        setModbusStatus(e.id, 'open')
        setPaneOpen(e.id, true)
      } else if (e.type === 'close') {
        setModbusStatus(e.id, 'closed')
        setPaneOpen(e.id, false)
      } else if (e.type === 'error') {
        setModbusStatus(e.id, 'error', e.message)
      }
    })
    return () => { offData(); offEvent() }
  }, [ipc, updateModbusBlockValue, setModbusStatus, setPaneOpen])
}
