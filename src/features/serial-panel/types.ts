/**
 * 串口面板工作区类型定义。
 * 镜像 legacy renderer.js createPane 的 pane 对象，但去掉 DOM 耦合字段（el/bodyTextNode），
 * 改为纯数据，由 React 渲染。
 */

import type { AppendMode } from '@shared/types'

/** 串口连接参数 */
export interface SerialOptions {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space'
}

/** 发送选项（每面板独立，对应 legacy pane.options 的发送字段） */
export interface SendOptions {
  /** 发送结尾：none/CR/LF/CRLF */
  append: AppendMode
  /** 以 HEX 格式发送（对应 legacy hexMode） */
  hexMode: boolean
  /** 发送回显（per-panel，覆盖全局 echoSend） */
  echoSend: boolean
  /** 接收缓冲 ms（对应 legacy bufferTime） */
  bufferTime: number
}

/** 面板几何（px，对应 legacy left/top/width/height） */
export interface PanelGeometry {
  x: number
  y: number
  w: number
  h: number
}

/** 单块数据：双格式（文本/HEX），含 echo 标记。镜像 legacy chunk {text,hex,isEcho} */
export interface PanelChunk {
  text: string
  hex: string
  isEcho: boolean
}

/** 面板类型 */
export type PanelType = 'serial' | 'tcp'

/** 视图模式 */
export type ViewMode = 'text' | 'hex'

/** 单个浮动面板的完整状态（纯数据，无 DOM 引用） */
export interface Panel {
  /** 端口路径（serial）或 tcp://host:port（tcp） */
  id: string
  /** 显示名（note 优先于原始名） */
  name: string
  /** 备注（对应 legacy pane.note，≤15 字） */
  note: string
  type: PanelType
  options: SerialOptions
  /** 连接是否打开 */
  open: boolean
  viewMode: ViewMode
  /** 置顶标记（每面板独立 pin，取代 legacy 全局 popTop） */
  pinned: boolean
  /** 隐藏（从工作区收起，仍在列表中） */
  hidden: boolean
  geometry: PanelGeometry
  /** 数据块（展示源，双格式） */
  chunks: PanelChunk[]
  /** 累积文本/HEX（导出/裁剪用，chunks 的派生缓存） */
  textBuffer: string
  hexBuffer: string
  autoScroll: boolean
  /** 发送栏草稿 */
  sendText: string
  /** 发送选项（每面板独立） */
  sendOptions: SendOptions
  /** 日志记录 */
  logging: { active: boolean; path: string | null }
  /** 是否启用「保留最新 N 条」限制（对应 legacy pane.limitView）。false 时仅按全局上限兜底 */
  limitView: boolean
  /** 保留条数（对应 legacy pane.limitCount，默认 LIMIT_VIEW_COUNT=1000） */
  limitCount: number
  /** 未读数据条数（隐藏/未在底部时收到的数据计数；不持久化，重启归零） */
  unread: number
  /** z-order（普通面板 10+递增；pin 面板 100000+） */
  z: number
}

/** 持久化的面板配置（对应 legacy exportPanelsConfig） */
export interface PanelConfig {
  id: string
  name: string
  type: PanelType
  options: SerialOptions
  pinned: boolean
  hidden: boolean
  geometry: PanelGeometry
  viewMode: ViewMode
  sendOptions: SendOptions
}

/**
 * 供脚本编辑器跨轨读取的面板概要。
 * 字段对齐 legacy renderer.js 的 getSerialPanelSummaries（window.getSerialPanelSummaries）。
 */
export interface SerialPanelSummary {
  id: string
  name: string
  type: PanelType
  open: boolean
  active: boolean
  hidden: boolean
  options?: SerialOptions
}
