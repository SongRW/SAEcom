import type { ControlSpec, NodeCategory, SocketSpec } from '@shared/types'
import {
  isKnownSandboxApi,
  unknownSandboxApis
} from '@/features/script-editor/nodes/component/sandboxCatalog'
import {
  isValidUserComponentKey,
  type UserComponentDescriptor
} from '@/features/script-editor/nodes/component/userComponent'
import type {
  CompositeComponentDescriptor
} from '@/features/script-editor/nodes/component/compositeComponent'

/**
 * 用户/插件组件描述符校验器。
 *
 * 用于：
 * - 编辑器实时诊断（Monaco markers + 诊断面板）
 * - 保存前校验
 * - 导入/安装时校验（拒绝非法描述符，不污染本地库）
 *
 * 返回结构化诊断，不抛异常。
 */

export type DiagnosticSeverity = 'error' | 'warning'

export interface Diagnostic {
  severity: DiagnosticSeverity
  message: string
  /** 关联字段（emit / key / controls 等），便于编辑器定位。 */
  field?: string
}

export interface ValidationResult<T = UserComponentDescriptor> {
  ok: boolean
  descriptor?: T
  errors: Diagnostic[]
}

const VALID_SOCKET_KINDS: SocketSpec['socket'][] = ['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket']
const VALID_CONTROL_TYPES: ControlSpec['type'][] = ['text', 'number', 'select', 'boolean']
const VALID_CONTROL_SOURCES: ControlSpec['source'][] = ['serial-panels', 'serial-ports', 'modbus-panels']
const VALID_CATEGORIES: NodeCategory[] = [
  'input', 'transform', 'split', 'numeric', 'string', 'compare', 'logical',
  'control', 'output', 'modbus', 'protocol', 'custom'
]

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

/**
 * 校验用户 JS 组件描述符。
 * @param existingKeys 已存在的 key 集合（内置 + 已注册用户），用于冲突检测。
 */
export function validateUserDescriptor(
  src: unknown,
  existingKeys: Iterable<string> = []
): ValidationResult {
  const errors: Diagnostic[] = []
  const taken = new Set(existingKeys)

  // 1. 结构可解析 + 必填字段
  if (!src || typeof src !== 'object') {
    return { ok: false, errors: [{ severity: 'error', message: '描述符必须是对象' }] }
  }
  const d = src as Record<string, unknown>

  const key = d.key
  const name = d.name
  const inputs = d.inputs
  const outputs = d.outputs
  const controls = d.controls
  const sandboxApis = d.sandboxApis
  const emit = d.emit

  if (typeof key !== 'string' || !key) {
    errors.push({ severity: 'error', field: 'key', message: 'key 必填且为字符串' })
  } else if (!isValidUserComponentKey(key)) {
    errors.push({ severity: 'error', field: 'key', message: "key 必须形如 'custom-xxx'（小写字母/数字/连字符）" })
  } else if (taken.has(key)) {
    errors.push({ severity: 'error', field: 'key', message: `key '${key}' 已存在（内置或已注册）` })
  }

  if (typeof name !== 'string' || !name.trim()) {
    errors.push({ severity: 'error', field: 'name', message: 'name 必填且为非空字符串' })
  }

  if (typeof d.description !== 'undefined' && typeof d.description !== 'string') {
    errors.push({ severity: 'error', field: 'description', message: 'description 若提供必须为字符串' })
  }

  if (typeof d.category !== 'undefined') {
    if (!VALID_CATEGORIES.includes(d.category as NodeCategory)) {
      errors.push({ severity: 'error', field: 'category', message: `category 必须是合法分类: ${VALID_CATEGORIES.join(', ')}` })
    }
  }

  // 2. 端口
  const portErrors = validatePorts(inputs, 'inputs')
  errors.push(...portErrors)
  const outputErrors = validatePorts(outputs, 'outputs')
  errors.push(...outputErrors)

  // 3. controls
  if (!Array.isArray(controls)) {
    errors.push({ severity: 'error', field: 'controls', message: 'controls 必须为数组' })
  } else {
    const controlKeys = new Set<string>()
    for (const [i, c] of controls.entries()) {
      const ce = validateControl(c, i)
      if (ce.key) {
        if (controlKeys.has(ce.key)) errors.push({ severity: 'error', field: `controls[${i}].key`, message: `control key '${ce.key}' 重复` })
        else controlKeys.add(ce.key)
      }
      errors.push(...ce.diagnostics)
    }
  }

  // 4. sandboxApis
  if (!isStringArray(sandboxApis)) {
    errors.push({ severity: 'error', field: 'sandboxApis', message: 'sandboxApis 必须为字符串数组' })
  } else {
    const unknown = unknownSandboxApis(sandboxApis)
    for (const u of unknown) {
      errors.push({ severity: 'error', field: 'sandboxApis', message: `未知 sandbox API: '${u}'（必须为内置白名单内的能力）` })
    }
  }

  // 5. emit 源码：可编译 + 静态扫描引用的标识符是否都在白名单（启发式，非完美；运行时 vm 白名单是最终防线）
  if (typeof emit !== 'string' || !emit.trim()) {
    errors.push({ severity: 'error', field: 'emit', message: 'emit 必填且为非空字符串（函数体源码）' })
  } else {
    const emitDiag = validateEmitSource(emit, isStringArray(sandboxApis) ? sandboxApis : [])
    errors.push(...emitDiag)
  }

  if (errors.some((e) => e.severity === 'error')) {
    return { ok: false, errors }
  }

  const descriptor: UserComponentDescriptor = {
    key: String(key),
    name: String(name),
    description: typeof d.description === 'string' ? d.description : undefined,
    dataFlow: typeof d.dataFlow === 'string' ? d.dataFlow : undefined,
    category: VALID_CATEGORIES.includes(d.category as NodeCategory) ? (d.category as NodeCategory) : undefined,
    inputs: Array.isArray(inputs) ? (inputs as SocketSpec[]) : [],
    outputs: Array.isArray(outputs) ? (outputs as SocketSpec[]) : [],
    controls: Array.isArray(controls) ? (controls as ControlSpec[]) : [],
    sandboxApis: isStringArray(sandboxApis) ? sandboxApis : [],
    emit: String(emit)
  }
  return { ok: true, descriptor, errors }
}

function validatePorts(v: unknown, field: string): Diagnostic[] {
  const out: Diagnostic[] = []
  if (!Array.isArray(v)) {
    out.push({ severity: 'error', field, message: `${field} 必须为数组` })
    return out
  }
  const keys = new Set<string>()
  for (const [i, p] of v.entries()) {
    if (!p || typeof p !== 'object') {
      out.push({ severity: 'error', field: `${field}[${i}]`, message: `${field}[${i}] 必须为对象` })
      continue
    }
    const port = p as Record<string, unknown>
    if (typeof port.key !== 'string' || !port.key) {
      out.push({ severity: 'error', field: `${field}[${i}].key`, message: '端口 key 必填且为字符串' })
    } else if (keys.has(port.key)) {
      out.push({ severity: 'error', field: `${field}[${i}].key`, message: `端口 key '${port.key}' 重复` })
    } else {
      keys.add(port.key)
    }
    if (!VALID_SOCKET_KINDS.includes(port.socket as SocketSpec['socket'])) {
      out.push({ severity: 'error', field: `${field}[${i}].socket`, message: `socket 必须是: ${VALID_SOCKET_KINDS.join(', ')}` })
    }
  }
  return out
}

function validateControl(c: unknown, i: number): { key?: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  if (!c || typeof c !== 'object') {
    diagnostics.push({ severity: 'error', field: `controls[${i}]`, message: `controls[${i}] 必须为对象` })
    return { diagnostics }
  }
  const ctrl = c as Record<string, unknown>
  let key: string | undefined
  if (typeof ctrl.key !== 'string' || !ctrl.key) {
    diagnostics.push({ severity: 'error', field: `controls[${i}].key`, message: 'control key 必填且为字符串' })
  } else key = ctrl.key
  if (typeof ctrl.label !== 'string' || !ctrl.label) {
    diagnostics.push({ severity: 'error', field: `controls[${i}].label`, message: 'control label 必填且为字符串' })
  }
  if (!VALID_CONTROL_TYPES.includes(ctrl.type as ControlSpec['type'])) {
    diagnostics.push({ severity: 'error', field: `controls[${i}].type`, message: `control type 必须是: ${VALID_CONTROL_TYPES.join(', ')}` })
  }
  if (ctrl.type === 'select') {
    if (!isStringArray(ctrl.options) || ctrl.options.length === 0) {
      diagnostics.push({ severity: 'error', field: `controls[${i}].options`, message: 'select 类型 control 必须提供非空 options 字符串数组' })
    }
  }
  if (typeof ctrl.source !== 'undefined' && !VALID_CONTROL_SOURCES.includes(ctrl.source as ControlSpec['source'])) {
    diagnostics.push({ severity: 'error', field: `controls[${i}].source`, message: `control source 必须是: ${VALID_CONTROL_SOURCES.join(', ')}` })
  }
  return { key, diagnostics }
}

/**
 * 校验 emit 源码：
 * 1. 能否经 new Function 编译（语法）。
 * 2. 静态扫描：emit 体里调用的 sandbox API 名是否都在声明的 sandboxApis + 白名单内。
 *    （启发式：用单词边界匹配白名单 API 名，发现声明外的 API 名则告警——可能是笔误或越权。）
 */
export function validateEmitSource(emit: string, declaredApis: string[]): Diagnostic[] {
  const out: Diagnostic[] = []
  // 1. 编译
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function('ctx', 'node', 'indent', 'helpers', emit)
  } catch (e: any) {
    out.push({ severity: 'error', field: 'emit', message: `emit 语法错误: ${String(e?.message || e)}` })
    return out
  }
  // 2. 静态扫描：发现 emit 中出现、但既未声明也不在白名单的标识符（仅扫描已知 API 名词表的反向：
  //    若 emit 引用了某个白名单 API 但未在 sandboxApis 声明，告警——便于用户补声明）。
  //    注意：这是 best-effort 提示，非强制（运行时 vm 白名单是最终防线）。
  // 实现从略：v1 仅做编译校验 + 已有的 unknownSandboxApis（声明侧）。emit 内标识符扫描留 v1.5。
  return out
}

/**
 * 组合（subgraph）组件描述符校验器。
 *
 * 与 validateUserDescriptor 并行：composite 无 emit 字段（逻辑在子图内），
 * 校验结构 + key/name/ports + subgraph 形状 + bindings 引用存在性。
 */
export function validateCompositeDescriptor(
  src: unknown,
  existingKeys: Iterable<string> = []
): ValidationResult<CompositeComponentDescriptor> {
  const errors: Diagnostic[] = []
  const taken = new Set(existingKeys)

  if (!src || typeof src !== 'object') {
    return { ok: false, errors: [{ severity: 'error', message: '描述符必须是对象' }] }
  }
  const d = src as Record<string, unknown>

  const key = d.key
  const name = d.name
  const inputs = d.inputs
  const outputs = d.outputs
  const subgraph = d.subgraph
  const inputBindings = d.inputBindings
  const outputBindings = d.outputBindings

  if (typeof key !== 'string' || !key) {
    errors.push({ severity: 'error', field: 'key', message: 'key 必填且为字符串' })
  } else if (!isValidUserComponentKey(key)) {
    errors.push({ severity: 'error', field: 'key', message: "key 必须形如 'custom-xxx'（小写字母/数字/连字符）" })
  } else if (taken.has(key)) {
    errors.push({ severity: 'error', field: 'key', message: `key '${key}' 已存在（内置或已注册）` })
  }

  if (typeof name !== 'string' || !name.trim()) {
    errors.push({ severity: 'error', field: 'name', message: 'name 必填且为非空字符串' })
  }

  if (typeof d.category !== 'undefined') {
    if (!VALID_CATEGORIES.includes(d.category as NodeCategory)) {
      errors.push({ severity: 'error', field: 'category', message: `category 必须是合法分类: ${VALID_CATEGORIES.join(', ')}` })
    }
  }

  errors.push(...validatePorts(inputs, 'inputs'))
  errors.push(...validatePorts(outputs, 'outputs'))

  // subgraph：nodes/connections 数组
  if (!subgraph || typeof subgraph !== 'object') {
    errors.push({ severity: 'error', field: 'subgraph', message: 'subgraph 必须为对象（子图画布数据）' })
  } else {
    const nodes = (subgraph as { nodes?: unknown }).nodes
    if (!Array.isArray(nodes) || nodes.length === 0) {
      errors.push({ severity: 'error', field: 'subgraph', message: 'subgraph.nodes 必须为非空数组' })
    }
    const conns = (subgraph as { connections?: unknown }).connections
    if (conns !== undefined && !Array.isArray(conns)) {
      errors.push({ severity: 'error', field: 'subgraph', message: 'subgraph.connections 若提供必须为数组' })
    }
  }

  // bindings：引用子图内存在的节点
  const nodeIds = new Set<string>()
  const sub = subgraph as { nodes?: Array<{ id: string | number }> } | undefined
  for (const n of sub?.nodes ?? []) nodeIds.add(String(n.id))

  for (const [i, b] of (Array.isArray(inputBindings) ? inputBindings : []).entries()) {
    if (!b || typeof b !== 'object') {
      errors.push({ severity: 'error', field: `inputBindings[${i}]`, message: 'inputBindings 项必须为对象' })
      continue
    }
    const bb = b as { nodeId?: unknown; portKey?: unknown; nodePortKey?: unknown }
    if (bb.nodeId === undefined || !nodeIds.has(String(bb.nodeId))) {
      errors.push({ severity: 'error', field: `inputBindings[${i}].nodeId`, message: `绑定节点 ${String(bb.nodeId)} 不存在于子图` })
    }
    if (typeof bb.portKey !== 'string' || !bb.portKey) {
      errors.push({ severity: 'error', field: `inputBindings[${i}].portKey`, message: 'portKey 必填' })
    }
  }
  for (const [i, b] of (Array.isArray(outputBindings) ? outputBindings : []).entries()) {
    if (!b || typeof b !== 'object') {
      errors.push({ severity: 'error', field: `outputBindings[${i}]`, message: 'outputBindings 项必须为对象' })
      continue
    }
    const bb = b as { nodeId?: unknown; portKey?: unknown; nodePortKey?: unknown }
    if (bb.nodeId === undefined || !nodeIds.has(String(bb.nodeId))) {
      errors.push({ severity: 'error', field: `outputBindings[${i}].nodeId`, message: `绑定节点 ${String(bb.nodeId)} 不存在于子图` })
    }
    if (typeof bb.portKey !== 'string' || !bb.portKey) {
      errors.push({ severity: 'error', field: `outputBindings[${i}].portKey`, message: 'portKey 必填' })
    }
  }

  if (errors.some((e) => e.severity === 'error')) {
    return { ok: false, errors }
  }

  const descriptor: CompositeComponentDescriptor = {
    key: String(key),
    name: String(name),
    description: typeof d.description === 'string' ? d.description : undefined,
    dataFlow: typeof d.dataFlow === 'string' ? d.dataFlow : undefined,
    category: VALID_CATEGORIES.includes(d.category as NodeCategory) ? (d.category as NodeCategory) : undefined,
    inputs: Array.isArray(inputs) ? (inputs as SocketSpec[]) : [],
    outputs: Array.isArray(outputs) ? (outputs as SocketSpec[]) : [],
    // 校验已保证 subgraph.nodes 为非空数组；此处形状断言（与运行时 normalize 兜底）
    subgraph: subgraph as CompositeComponentDescriptor['subgraph'],
    inputBindings: Array.isArray(inputBindings) ? inputBindings as CompositeComponentDescriptor['inputBindings'] : [],
    outputBindings: Array.isArray(outputBindings) ? outputBindings as CompositeComponentDescriptor['outputBindings'] : []
  }
  return { ok: true, descriptor, errors }
}
