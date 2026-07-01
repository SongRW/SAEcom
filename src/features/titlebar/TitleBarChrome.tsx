import React from 'react'
import { detectPlatform } from '@/features/titlebar/platform'
import { WindowControls } from '@/features/titlebar/WindowControls'

export interface TitleBarChromeProps {
  /** 显式标题；缺省回退 document.title */
  title?: string
  /** 状态插槽（主窗：连接徽章） */
  status?: React.ReactNode
  /** 右侧插槽（panel：功能按钮；主窗本期为空） */
  right?: React.ReactNode
}

/**
 * 统一窗口栏底座（参考 zcode）。
 * - 整栏 drag，交互元素 no-drag
 * - 品牌：圆角方块（primary）+ 文字渐变标题
 * - 平台留白：mac 左 78px（红绿灯）；win 右 138px（overlay 按钮）；linux 自绘控件
 * - 视觉：bg-card + 底部 border（风格 B：微高亮 + 品牌渐变标题）
 */
export function TitleBarChrome({ title, status, right }: TitleBarChromeProps) {
  const platform = detectPlatform()
  const docTitle = typeof document !== 'undefined' ? document.title : ''
  const label = title ?? docTitle

  const padClass =
    platform === 'mac' ? 'pl-[78px] pr-2'
    : platform === 'win' ? 'pl-2 pr-[138px]'
    : 'pl-2 pr-2'

  return (
    <div
      // h-(--titlebar-height)：与 Sidebar 共享该 token，Sidebar 顶端从本栏下沿起算，
      // 避免其 fixed 容器顶端 38px 盖住标题栏（品牌/标题/红绿灯/拖拽区）。
      className={`flex h-(--titlebar-height) items-center gap-2 border-b border-border bg-card ${padClass} [app-region:drag] select-none`}
    >
      {/* 品牌：圆角方块 + 渐变标题 */}
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          S
        </span>
        <span className="truncate bg-gradient-to-r from-foreground to-primary bg-clip-text text-sm font-semibold text-transparent">
          {label}
        </span>
      </div>

      {/* 状态插槽（no-drag） */}
      {status ? (
        <div className="[app-region:no-drag]">
          {status}
        </div>
      ) : null}

      {/* 弹性占位 */}
      <div className="flex-1" />

      {/* right 插槽（no-drag） */}
      {right ? (
        <div className="[app-region:no-drag]">
          {right}
        </div>
      ) : null}

      {/* Linux 自绘窗口控件 */}
      {platform === 'linux' ? <WindowControls /> : null}
    </div>
  )
}
