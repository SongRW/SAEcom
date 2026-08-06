/**
 * 脚本监听选项归一化与分包裁剪 —— 纯函数，从 main.ts 抽离。
 *
 * 对照搬移自 main.ts:246-266，零变化：
 * - normalizeScriptListenOptions：bufferMs(默认 50) + append(默认 CRLF)
 * - normalizeAppendMode：无/none → none；CR/LF/CRLF → 大写；其余 → CRLF
 * - trimScriptPacketEnding：按 append 模式裁掉包尾分隔符
 *
 * 抽离到此处供 serial-provider 与 script.service 共享（原为 main.ts 顶层函数）。
 */

export interface ScriptListenOptions {
  bufferMs?: number
  append?: string
}

export function normalizeAppendMode(value: unknown): string {
  if (value === '无' || value === 'none') return 'none'
  const mode = String(value || 'CRLF').toUpperCase()
  if (mode === 'CR') return 'CR'
  if (mode === 'LF') return 'LF'
  if (mode === 'CRLF') return 'CRLF'
  return 'CRLF'
}

export function normalizeScriptListenOptions(options: ScriptListenOptions = {}): Required<ScriptListenOptions> {
  const bufferMs = Math.max(0, parseInt(String(options.bufferMs ?? 50), 10) || 0)
  const append = normalizeAppendMode(options.append)
  return { bufferMs, append }
}

export function trimScriptPacketEnding(value: string, append: string): string {
  if (append === 'CR') return value.endsWith('\r') ? value.slice(0, -1) : value
  if (append === 'LF') return value.endsWith('\n') ? value.slice(0, -1) : value
  if (append === 'CRLF') return value.endsWith('\r\n') ? value.slice(0, -2) : value
  return value
}
