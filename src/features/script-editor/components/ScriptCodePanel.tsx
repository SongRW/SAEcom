import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Code as CodeIcon, PaintBrushBroad as FrameCorners } from '@phosphor-icons/react'
import { CodeEditor } from '@/features/script-editor/components/CodeEditor'

interface ScriptCodePanelProps {
  code: string
  scriptName?: string | null
  readOnly?: boolean
  onChange?: (code: string) => void
  /** 切回画布视图（把纯代码脚本转为可视化节点） */
  onShowCanvas?: () => void
}

/**
 * 纯代码 / legacy 脚本视图（Monaco 版）。
 * 无流程图标记的 .js（如 shared/samples 示例）打开后画布为空，
 * 用本面板渲染源码，避免「打开了但什么都看不见」。
 *
 * 原为 textarea（B 层重构）：升级为 CodeEditor（Monaco）获得行号/语法高亮/
 * Tab 补全，与自定义组件 emit 编辑器同一套组件。
 */
export function ScriptCodePanel({
  code,
  scriptName,
  readOnly,
  onChange,
  onShowCanvas
}: ScriptCodePanelProps) {
  return (
    <section className="script-editor-code" aria-label="脚本源码" data-testid="script-code-panel">
      <div className="script-editor-code__header">
        <div className="script-editor-code__title">
          <CodeIcon size={16} weight="bold" />
          <span>源码</span>
          {scriptName ? <Badge variant="secondary">{scriptName}</Badge> : null}
          <Badge variant="outline">纯代码</Badge>
        </div>
        <div className="script-editor-code__meta">
          <span>运行绑定当前活动面板</span>
          {onShowCanvas ? (
            <Button
              size="sm"
              variant="outline"
              title="切换到画布视图"
              type="button"
              data-testid="show-canvas-view"
              onClick={onShowCanvas}
            >
              <FrameCorners size={14} />
              <span>显示画布</span>
            </Button>
          ) : null}
        </div>
      </div>
      <p className="script-editor-code__hint">
        此脚本没有流程图节点，以下为可运行的 JavaScript 源码。先连接并选中 TCP/串口面板，再点工具栏「运行」。
        点右上「显示画布」可切换到空白画布添加节点。
      </p>
      <div className="script-editor-code__editor" data-testid="script-code-editor">
        <CodeEditor
          height="100%"
          language="javascript"
          onChange={(v) => onChange?.(v)}
          readOnly={readOnly || !onChange}
          value={code}
        />
      </div>
    </section>
  )
}
