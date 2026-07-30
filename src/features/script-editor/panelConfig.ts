import type { AppendMode, PanelConfigRef, SerialOpenOptions, SerialPanelSummary } from '@shared/types'

const PANEL_CONFIG_KINDS = new Set<PanelConfigRef['kind']>([
  'current-panel',
  'panel',
  'serial-port',
  'tcp-endpoint',
  'tcp-server',
  'file',
  'local'
])

export const BASE_SERIAL_OPTIONS: Required<Pick<SerialOpenOptions, 'baudRate' | 'dataBits' | 'stopBits' | 'parity'>> = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
}

export const BASE_SERIAL_BUFFER_MS = 50
export const BASE_SERIAL_APPEND: AppendMode = 'CRLF'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim()
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasObjectSerialOptions(value: Record<string, unknown>): boolean {
  return value.serialOptions === undefined || isRecord(value.serialOptions)
}

function isSerialNode(nodeKey: string): boolean {
  return nodeKey === 'input-serial' || nodeKey === 'output-serial'
}

function isPanelNode(nodeKey: string): boolean {
  return nodeKey === 'input-panel' || nodeKey === 'output-panel'
}

export function serialOptionsOrBase(options?: SerialOpenOptions): SerialOpenOptions {
  return {
    ...options,
    baudRate: Number(options?.baudRate || BASE_SERIAL_OPTIONS.baudRate),
    dataBits: Number(options?.dataBits || BASE_SERIAL_OPTIONS.dataBits),
    stopBits: Number(options?.stopBits || BASE_SERIAL_OPTIONS.stopBits),
    parity: String(options?.parity || BASE_SERIAL_OPTIONS.parity)
  }
}

export function inheritedSerialSummary(options?: SerialOpenOptions): Array<[string, string]> {
  const normalized = serialOptionsOrBase(options)
  return [
    ['波特率', String(normalized.baudRate)],
    ['数据位', String(normalized.dataBits)],
    ['停止位', String(normalized.stopBits)],
    ['校验位', String(normalized.parity)]
  ]
}

export function fallbackSerialSummary(): Array<[string, string]> {
  return inheritedSerialSummary(BASE_SERIAL_OPTIONS)
}

export function serialNodeSummary(nodeKey: string, data: Record<string, unknown>): Array<[string, string]> {
  const configRef = isPanelConfigRef(data.configRef) ? data.configRef : undefined
  const options = serialOptionsFromData(data, configRef)
  void nodeKey
  return [
    ['串口', String(data.portPath || configRef?.portPath || '未选择')],
    ['波特率', String(options.baudRate)]
  ]
}

export function activeSerialPanel(panels: SerialPanelSummary[]): SerialPanelSummary | null {
  return panels.find((panel) => panel.type === 'serial' && panel.active)
    || panels.find((panel) => panel.type === 'serial')
    || null
}

export function createPanelConfigRef(nodeKey: string, panels: SerialPanelSummary[] = []): PanelConfigRef {
  if (isSerialNode(nodeKey)) {
    const panel = activeSerialPanel(panels)
    if (panel) {
      const serialOptions = serialOptionsOrBase(panel.options)
      return {
        kind: 'serial-port',
        portPath: panel.id,
        serialOptions
      }
    }
    return {
      kind: 'serial-port',
      serialOptions: BASE_SERIAL_OPTIONS,
      usesFallbackOptions: true
    }
  }

  if (isPanelNode(nodeKey)) return { kind: 'current-panel' }
  if (nodeKey.includes('tcp-server')) return { kind: 'tcp-server', port: 9000 }
  if (nodeKey.includes('tcp')) return { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
  if (nodeKey.includes('file')) return { kind: 'file' }
  return { kind: 'local' }
}

export function createDefaultNodeData(nodeKey: string, panels: SerialPanelSummary[] = []): Record<string, unknown> {
  if (nodeKey === 'transform-object') return { keys: [] }
  // protocol-bitfield 中性默认：单 8 位字段（不预设任何具体协议的位段布局）
  if (nodeKey === 'protocol-bitfield') return { mode: '打包', fields: [{ id: 'f1', name: 'field', bits: 8 }] }
  const configRef = createPanelConfigRef(nodeKey, panels)
  const panelDefaults = configRef.kind === 'panel' ? { panelId: configRef.panelId } : {}
  const serialDefaults = isSerialNode(nodeKey)
    ? serialDataFromConfigRef(configRef, nodeKey, activeSerialPanel(panels))
    : {}
  if (nodeKey === 'input-manual') return { content: '', mode: 'text', configRef }
  if (nodeKey === 'input-file') return { path: '', encoding: 'utf8', configRef }
  if (nodeKey === 'input-timer') return { interval: 1000, repeat: '单次', configRef }
  if (nodeKey === 'output-file') return { path: '', mode: '追加', configRef }
  if (nodeKey === 'output-log') return { level: 'info', prefix: '', configRef }
  if (nodeKey === 'output-variable') return { name: 'result', configRef }
  if (isSerialNode(nodeKey)) {
    return nodeKey.startsWith('output-')
      ? { ...serialDefaults, mode: 'text', configRef }
      : { ...serialDefaults, configRef }
  }
  if (nodeKey.startsWith('output-')) return { mode: 'text', append: '无', ...panelDefaults, configRef }
  return { ...panelDefaults, configRef }
}

export function migrateNodeData(nodeKey: string, data: Record<string, unknown> = {}): Record<string, unknown> {
  if (nodeKey === 'transform-object') {
    return { keys: Array.isArray(data.keys) ? data.keys : [] }
  }
  if (nodeKey === 'protocol-bitfield') {
    // fields 数组守门：非法结构回退中性默认
    const fields = Array.isArray(data.fields)
      ? (data.fields as unknown[])
          .map((entry) => ({
            id: String((entry as { id?: string })?.id ?? ''),
            name: String((entry as { name?: string })?.name ?? ''),
            bits: Number((entry as { bits?: number })?.bits) || 8
          }))
          .filter((entry) => entry.id)
      : [{ id: 'f1', name: 'field', bits: 8 }]
    return { mode: String(data.mode ?? '打包'), fields }
  }

  if (isSerialNode(nodeKey)) {
    return migrateSerialNodeData(nodeKey, data)
  }

  if (isPanelConfigRef(data.configRef)) return data

  if (typeof data.panelId === 'string' && data.panelId.trim()) {
    if (data.panelId === '__current__') return { ...data, configRef: { kind: 'current-panel' } }
    return { ...data, configRef: { kind: 'panel', panelId: data.panelId } }
  }

  if (typeof data.portPath === 'string' && data.portPath.trim() && data.portPath !== '__current__') {
    return {
      ...data,
      configRef: {
        kind: 'serial-port',
        portPath: data.portPath,
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    }
  }

  if (nodeKey.includes('tcp') && (typeof data.host === 'string' || data.port !== undefined)) {
    return {
      ...data,
      configRef: nodeKey.includes('tcp-server')
        ? {
            kind: 'tcp-server',
            port: numberConfigValue(data.port, 9000)
          }
        : {
            kind: 'tcp-endpoint',
            host: String(data.host || '127.0.0.1'),
            port: numberConfigValue(data.port, 8080)
          }
    }
  }

  return { ...data, configRef: createPanelConfigRef(nodeKey) }
}

export function updateConfigRefForControl(
  nodeKey: string,
  data: Record<string, unknown>,
  controlKey: string,
  value: unknown
): Record<string, unknown> {
  const next = { ...data, [controlKey]: value }
  const currentRef = isPanelConfigRef(next.configRef) ? next.configRef : createPanelConfigRef(nodeKey)

  if (isSerialNode(nodeKey) && SERIAL_CONFIG_CONTROL_KEYS.has(controlKey)) {
    return syncSerialNodeData(nodeKey, next, currentRef, controlKey)
  }

  if (isPanelNode(nodeKey) && controlKey === 'panelId') {
    const panelId = String(value || '').trim()
    if (panelId === '__current__') return { ...next, configRef: { kind: 'current-panel' } }
    if (panelId) return { ...next, configRef: { kind: 'panel', panelId } }
    return next
  }

  if (nodeKey.includes('tcp-server') && controlKey === 'port') {
    return {
      ...next,
      configRef: {
        kind: 'tcp-server',
        port: numberConfigValue(value, currentRef.port || 9000)
      }
    }
  }

  if (nodeKey.includes('tcp') && (controlKey === 'host' || controlKey === 'port')) {
    return {
      ...next,
      configRef: {
        kind: 'tcp-endpoint',
        host: String(next.host || currentRef.host || '127.0.0.1'),
        port: numberConfigValue(next.port, currentRef.port || 8080)
      }
    }
  }

  if (nodeKey.includes('file') && controlKey === 'path') {
    return {
      ...next,
      configRef: {
        kind: 'file',
        path: String(value ?? '')
      }
    }
  }

  return next
}

export function resolvePanelConfigRef(ref: PanelConfigRef, panels: SerialPanelSummary[]): PanelConfigRef {
  if (ref.kind !== 'current-panel') return ref
  const active = panels.find((panel) => panel.active) || panels[0]
  if (!active) return ref
  if (active.type === 'serial') {
    return {
      kind: 'serial-port',
      portPath: active.id,
      serialOptions: serialOptionsOrBase(active.options)
    }
  }
  return {
    kind: 'panel',
    panelId: active.id
  }
}

export function validateNodeConfig(nodeKey: string, data: Record<string, unknown> = {}): string[] {
  const configRef = configRefForValidation(nodeKey, data)

  switch (nodeKey) {
    case 'input-panel':
    case 'output-panel':
      if (configRef.kind === 'current-panel') return []
      return configRef.panelId ? [] : [`${nodeLabel(nodeKey)}：未选择面板`]
    case 'input-serial':
    case 'output-serial':
      if (configRef.portPath || data.portPath) return []
      return [`${nodeLabel(nodeKey)}：未选择串口`]
    case 'input-tcp':
    case 'output-tcp':
      if (!String(configValue(data, configRef, 'host') || '').trim()) return [`${nodeLabel(nodeKey)}：主机不能为空`]
      if (!Number(configValue(data, configRef, 'port'))) return [`${nodeLabel(nodeKey)}：端口不能为空`]
      return []
    case 'input-tcp-server':
    case 'output-tcp-server':
      return Number(configRef.port || data.port) ? [] : [`${nodeLabel(nodeKey)}：端口不能为空`]
    case 'input-file':
    case 'output-file':
      return String(configValue(data, configRef, 'path') || '').trim() ? [] : [`${nodeLabel(nodeKey)}：文件路径不能为空`]
    case 'output-variable':
      return String(data.name || '').trim() ? [] : ['变量存储：变量名不能为空']
    case 'transform-object':
      return []
    default:
      return []
  }
}

export function isPanelConfigRef(value: unknown): value is PanelConfigRef {
  if (!isRecord(value) || !PANEL_CONFIG_KINDS.has(value.kind as PanelConfigRef['kind'])) return false

  switch (value.kind) {
    case 'current-panel':
    case 'local':
      return true
    case 'panel':
      return isNonEmptyString(value.panelId)
    case 'serial-port':
      return hasObjectSerialOptions(value)
    case 'tcp-endpoint':
      return isNonEmptyString(value.host) && isFiniteNumber(value.port)
    case 'tcp-server':
      return isFiniteNumber(value.port)
    case 'file':
      return value.path === undefined || typeof value.path === 'string'
    default:
      return false
  }
}

const SERIAL_CONFIG_CONTROL_KEYS = new Set([
  'portPath',
  'baudRate',
  'dataBits',
  'stopBits',
  'parity',
  'bufferMs',
  'append'
])

function migrateSerialNodeData(nodeKey: string, data: Record<string, unknown>): Record<string, unknown> {
  const currentRef = isPanelConfigRef(data.configRef)
    ? serialConfigRefFromLegacy(data.configRef)
    : serialConfigRefFromLegacy(createPanelConfigRef(nodeKey))
  // 先用 data 垫底，再用 configRef 提取出的权威串口设置（端口/选项）覆盖，
  // 最后再展开一次 data 以保留用户显式设置的非串口字段（append/mode 等）。
  // portPath 例外：defaultNodeData 给串口节点带顶层 portPath:""，若让它盖回会清空
  // 刚从 configRef 提取出的真实端口 → 校验报「未选择串口」→ saveScript 拦截保存。
  // 故末尾展开时去掉空的 portPath 键（仅当用户显式填了非空端口时才采纳顶层值）。
  const legacyTail = { ...data }
  if (!String(legacyTail.portPath ?? '').trim()) delete legacyTail.portPath
  return syncSerialNodeData(
    nodeKey,
    { ...data, ...serialDataFromConfigRef(currentRef, nodeKey), ...legacyTail },
    currentRef
  )
}

function serialConfigRefFromLegacy(ref: PanelConfigRef): PanelConfigRef {
  if (ref.kind === 'panel') {
    return {
      kind: 'serial-port',
      portPath: ref.panelId,
      serialOptions: serialOptionsOrBase(ref.serialOptions),
      usesFallbackOptions: ref.usesFallbackOptions
    }
  }
  if (ref.kind === 'current-panel') {
    return {
      kind: 'serial-port',
      serialOptions: BASE_SERIAL_OPTIONS,
      usesFallbackOptions: true
    }
  }
  if (ref.kind === 'serial-port') {
    return {
      kind: 'serial-port',
      portPath: ref.portPath,
      serialOptions: serialOptionsOrBase(ref.serialOptions),
      usesFallbackOptions: ref.usesFallbackOptions ?? !ref.portPath
    }
  }
  return {
    kind: 'serial-port',
    serialOptions: BASE_SERIAL_OPTIONS,
    usesFallbackOptions: true
  }
}

function syncSerialNodeData(
  nodeKey: string,
  data: Record<string, unknown>,
  currentRef: PanelConfigRef,
  touchedControlKey?: string
): Record<string, unknown> {
  const portPath = String(data.portPath ?? currentRef.portPath ?? '').trim()
  const serialOptions = serialOptionsFromData(data, currentRef)
  const append = normalizeAppendMode(data.append ?? currentRef.append)
  const bufferMs = numberConfigValue(data.bufferMs ?? currentRef.bufferMs, BASE_SERIAL_BUFFER_MS)
  const usesFallbackOptions = serialOptionControlTouched(touchedControlKey)
    ? false
    : currentRef.usesFallbackOptions
  const configRef: PanelConfigRef = {
    kind: 'serial-port',
    ...(portPath ? { portPath } : {}),
    serialOptions,
    ...(usesFallbackOptions !== undefined ? { usesFallbackOptions } : {})
  }
  if (!portPath && usesFallbackOptions !== false) configRef.usesFallbackOptions = true
  return {
    ...data,
    ...(portPath ? { portPath } : {}),
    baudRate: serialOptions.baudRate,
    dataBits: serialOptions.dataBits,
    stopBits: serialOptions.stopBits,
    parity: serialOptions.parity,
    ...(nodeKey === 'input-serial' ? { bufferMs } : {}),
    append,
    configRef
  }
}

function serialOptionsFromData(data: Record<string, unknown>, currentRef?: PanelConfigRef): SerialOpenOptions {
  return serialOptionsOrBase({
    ...(currentRef?.serialOptions || {}),
    baudRate: numberConfigValue(data.baudRate, currentRef?.serialOptions?.baudRate || BASE_SERIAL_OPTIONS.baudRate),
    dataBits: numberConfigValue(data.dataBits, currentRef?.serialOptions?.dataBits || BASE_SERIAL_OPTIONS.dataBits),
    stopBits: numberConfigValue(data.stopBits, currentRef?.serialOptions?.stopBits || BASE_SERIAL_OPTIONS.stopBits),
    parity: String(data.parity || currentRef?.serialOptions?.parity || BASE_SERIAL_OPTIONS.parity)
  })
}

function serialDataFromConfigRef(
  ref: PanelConfigRef,
  nodeKey: string,
  sourcePanel?: SerialPanelSummary | null
): Record<string, unknown> {
  const normalized = serialConfigRefFromLegacy(ref)
  const options = serialOptionsOrBase(normalized.serialOptions)
  const panelBufferMs = Number(sourcePanel?.bufferMs)
  return {
    ...(normalized.portPath ? { portPath: normalized.portPath } : {}),
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    stopBits: options.stopBits,
    parity: options.parity,
    ...(nodeKey === 'input-serial' ? { bufferMs: Number.isFinite(panelBufferMs) ? panelBufferMs : BASE_SERIAL_BUFFER_MS } : {}),
    append: normalizeAppendMode(sourcePanel?.append)
  }
}

function serialOptionControlTouched(controlKey?: string): boolean {
  return controlKey === 'baudRate' || controlKey === 'dataBits' || controlKey === 'stopBits' || controlKey === 'parity'
}

function normalizeAppendMode(value: unknown): AppendMode {
  if (value === '无' || value === 'none') return 'none'
  const text = String(value || BASE_SERIAL_APPEND).toUpperCase()
  if (text === 'CR') return 'CR'
  if (text === 'LF') return 'LF'
  if (text === 'CRLF') return 'CRLF'
  return BASE_SERIAL_APPEND
}

function configRefForValidation(nodeKey: string, data: Record<string, unknown>): PanelConfigRef | Record<string, unknown> {
  if (isPanelConfigRef(data.configRef)) return data.configRef
  if (isRecord(data.configRef)) return data.configRef
  return createPanelConfigRef(nodeKey)
}

function configValue(data: Record<string, unknown>, configRef: PanelConfigRef | Record<string, unknown>, key: string): unknown {
  const values = configRef as Record<string, unknown>
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : values[key]
}

function numberConfigValue(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nodeLabel(nodeKey: string): string {
  const labels: Record<string, string> = {
    'input-panel': '接收面板',
    'input-serial': '接收串口',
    'input-tcp': '接收TCP',
    'input-tcp-server': 'TCP服务器接收',
    'input-file': '读取文件',
    'output-panel': '发送面板',
    'output-serial': '发送串口',
    'output-tcp': '发送TCP',
    'output-tcp-server': 'TCP服务器发送',
    'output-file': '写入文件',
    'output-variable': '变量存储'
  }
  return labels[nodeKey] || nodeKey
}
