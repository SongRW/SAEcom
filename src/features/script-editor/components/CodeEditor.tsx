import { useEffect, useRef } from 'react'
import Editor, { type OnMount, type BeforeMount, type Monaco, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  ModuleResolutionKind,
  ScriptTarget,
  javascriptDefaults
} from 'monaco-editor/language/typescript/monaco.contribution'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import type { editor } from 'monaco-editor'
import { useSettingsStore } from '@/shared/store/settings'
import {
  buildEmitHelpersExtraLib,
  sandboxApiExtraLib
} from '@/features/script-editor/nodes/component/editor-types'

/**
 * Monaco 使用 Vite 打包的同源 worker，避免 @monaco-editor/react 默认 AMD loader
 * 从 CDN 加载并被 Electron 生产 CSP 拦截，导致编辑器永久停在 Loading...。
 */
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'javascript' || label === 'typescript') return new TypeScriptWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

/**
 * Monaco 代码编辑器封装。
 *
 * 用途：自定义 JS 组件的 emit 函数源码编辑（组7 接入编辑器对话框）。
 * - 主题对齐项目 dark（读 useSettingsStore.dark）
 * - Tab 补全 + 实时诊断（Monaco 内建 JS/TS language）
 * - addExtraLib 注入：
 *   · EmitHelpers 类型（getInputVar/jsString/outVar/... 精确签名 + 悬停文档）—— emit 函数体里获得补全
 *   · sandbox API 全量签名 d.ts（send/waitOnePacket/listenSerialPackets/...）—— 与 sandboxCatalog 白名单一致
 *
 * 注：Monaco 与 JS/TS worker 均由 Vite 发出同源静态资源，支持 Electron 离线与生产 CSP。
 */
export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'javascript' | 'typescript' | 'python'
  /** 额外诊断（描述符校验器产出），叠加到 Monaco markers。 */
  diagnostics?: Array<{ message: string; line?: number; severity?: 'error' | 'warning' }>
  readOnly?: boolean
  height?: string | number
}

let extraLibsInjected = false

/** 注入自定义组件相关的类型存根（仅注入一次）。 */
function injectExtraLibs(monaco: Monaco): void {
  if (extraLibsInjected) return
  extraLibsInjected = true
  const js = javascriptDefaults
  js.setCompilerOptions({
    target: ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ModuleResolutionKind.NodeJs,
    noLib: false,
    noEmit: true,
    allowJs: true,
    checkJs: false
  })
  // emit helpers 类型（emit 函数签名 + helpers 包）
  js.addExtraLib(buildEmitHelpersExtraLib(), 'file:///emit-helpers.d.ts')
  // sandbox API 全量签名
  js.addExtraLib(sandboxApiExtraLib(), 'file:///sandbox-api.d.ts')
}

export function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  diagnostics = [],
  readOnly = false,
  height = 320
}: CodeEditorProps) {
  const dark = useSettingsStore((s) => s.dark)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const beforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco
    injectExtraLibs(monaco)
  }

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    // Tab 补全 + quick suggestions（Zed 式体验）
    ed.updateOptions({
      tabSize: 2,
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      wordBasedSuggestions: 'currentDocument'
    })

    // Dialog/flex 容器在挂载后才完成尺寸计算。用 host 尺寸驱动 layout，避免 Monaco
    // 首帧缓存 5×5px，且持续处理窗口缩放、侧栏与诊断列表高度变化。
    const host = ed.getContainerDomNode()
    const layoutTarget = host.parentElement ?? host
    const relayout = () => {
      const { width, height } = layoutTarget.getBoundingClientRect()
      if (width > 0 && height > 0) ed.layout({ width, height })
    }
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = new ResizeObserver(relayout)
    resizeObserverRef.current.observe(layoutTarget)
    window.requestAnimationFrame(relayout)
  }

  useEffect(() => () => resizeObserverRef.current?.disconnect(), [])

  // 叠加外部诊断到 markers
  useEffect(() => {
    const monaco = monacoRef.current
    const ed = editorRef.current
    if (!monaco || !ed) return
    const model = ed.getModel()
    if (!model) return
    const markers: editor.IMarkerData[] = diagnostics.map((d) => ({
      message: d.message,
      startLineNumber: d.line ?? 1,
      endLineNumber: d.line ?? 1,
      startColumn: 1,
      endColumn: 1,
      severity: d.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error
    }))
    monaco.editor.setModelMarkers(model, 'custom-component-validator', markers)
  }, [diagnostics])

  return (
    <Editor
      beforeMount={beforeMount}
      className="script-editor-code-editor"
      height={height}
      language={language}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        tabCompletion: 'on',
        wordWrap: 'on',
        automaticLayout: true,
        readOnly,
        fixedOverflowWidgets: true
      }}
      theme={dark ? 'vs-dark' : 'vs'}
      value={value}
    />
  )
}

// Monaco 由 loader.config({ monaco }) 指向上方的本地 ESM 实例；禁止回退到 CDN。
