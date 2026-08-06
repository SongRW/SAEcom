import type { ControlSpec, NodeCategory } from '@shared/types'
import {
  SANDBOX_API_CATALOG
} from '@/features/script-editor/nodes/component/sandboxCatalog'
import type { Diagnostic } from '@/features/script-editor/nodes/component/validate'
import type { UserComponentDescriptor } from '@/features/script-editor/nodes/component/userComponent'

/**
 * 自定义组件编辑器的纯辅助函数（与 React/Monaco 解耦，便于单元测试）。
 *
 * - createEmptyDescriptor / cloneDescriptor：表单初始/拷贝
 * - mockControlValues：试编译时把 controls 默认值映射为节点 data
 * - sandboxApisError：sandboxApis 白名单校验文案
 * - formatDiagnostics：诊断列表 → 纯文案
 */

const DEFAULT_EMIT_TEMPLATE = `// emit 函数体：(ctx, node, indent, helpers) => string
// 产出的代码会进 vm 沙箱运行（仅可调用 sandboxApis 里声明的白名单 API）。
// helpers: getInputVar / jsString / outVar / data / configRef / indent / ...
return indent + 'var ' + helpers.outVar(node) + ' = ' + helpers.getInputVar(ctx, node) + ';\\n'
`

/** 默认新建表单（create 模式）。 */
export function createEmptyDescriptor(): UserComponentDescriptor {
  return {
    key: 'custom-',
    name: '',
    description: '',
    category: 'custom' as NodeCategory,
    inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
    outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
    controls: [],
    sandboxApis: [],
    emit: DEFAULT_EMIT_TEMPLATE
  }
}

/**
 * 判定表单是否需要在本次渲染重置。
 *
 * 回归根因：create 模式下父层每次渲染都会产生新的空 descriptor 引用，
 * 若 effect 依赖 initialDescriptor 的身份，父层任意重渲染（如 3 秒串口轮询）
 * 都会把用户输入清空。因此重置只应在两种边沿发生：
 * - open 从 false→true（打开对话框）
 * - 编辑目标从 A 切换到 B（打开期间切换文件）
 */
export function shouldResetForm(
  open: boolean,
  wasOpen: boolean,
  editFileName: string | null,
  prevEditFileName: string | null
): boolean {
  if (!open) return false
  if (!wasOpen) return true
  return editFileName !== prevEditFileName
}

/** 深拷贝 descriptor（避免 mutate 父级对象）。 */
export function cloneDescriptor(d: UserComponentDescriptor): UserComponentDescriptor {
  return JSON.parse(JSON.stringify(d)) as UserComponentDescriptor
}

/** sandboxApis 校验：返回首个未知 API 的错误文案（无错误返回 undefined）。 */
export function sandboxApisError(apis: string[]): string | undefined {
  const set = new Set<string>(SANDBOX_API_CATALOG)
  const unknown = apis.filter((a) => !set.has(a))
  if (unknown.length === 0) return undefined
  return `未知 sandbox API: ${unknown.join(', ')}`
}

/** 把 controls 的 default 转成 mock 节点 data（试编译用）。 */
export function mockControlValues(controls: ControlSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of controls) {
    if (c.default !== undefined) {
      out[c.key] = c.default
    } else if (c.type === 'select' && c.options?.length) {
      out[c.key] = c.options[0]
    } else if (c.type === 'number') {
      out[c.key] = 0
    } else if (c.type === 'boolean') {
      out[c.key] = false
    } else {
      out[c.key] = ''
    }
  }
  return out
}

/** 把诊断列表格式化为纯文案（错误展示用）。 */
export function formatDiagnostics(errors: Diagnostic[]): string {
  return errors.map((e) => `[${e.field ?? 'root'}] ${e.message}`).join('\n')
}
