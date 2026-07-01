import { SerialPanelWorkspace } from '@/features/serial-panel/SerialPanelWorkspace'

/**
 * 工作区：串口面板浮动工作区。
 * 包装 SerialPanelWorkspace（负责面板生命周期、onData 总线、浮动渲染）。
 */
export function Workspace() {
  return <SerialPanelWorkspace />
}
