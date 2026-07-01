import type { ReteGraphExport } from '@shared/types'

export const FLOW_START_MARKER = 'VS_FLOW_START'
export const FLOW_END_MARKER = 'VS_FLOW_END'
const GENERATED_CODE_MARKER = '// Generated code:'

export type ParseScriptResult =
  | { ok: true; graph: ReteGraphExport; code: string }
  | { ok: false; reason: 'missing-markers' | 'invalid-json'; code: string; error?: string }

export function buildScriptFile(graph: ReteGraphExport, code: string): string {
  return `/* ${FLOW_START_MARKER}\n${JSON.stringify(graph, null, 2)}\n${FLOW_END_MARKER} */\n${GENERATED_CODE_MARKER}\n${code.trim()}\n`
}

export function parseScriptFile(content: string): ParseScriptResult {
  const source = String(content ?? '')
  // startIndex：取首次出现的起始标记即可。
  const startIndex = source.indexOf(FLOW_START_MARKER)
  // endIndex：取「最后」出现的结束标记 —— 结束标记恒在文件末段，
  // 取 lastIndexOf 可避免被生成代码/legacy 代码里出现的同名字面量提前截断。
  const endIndex = source.lastIndexOf(FLOW_END_MARKER)

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return { ok: false, reason: 'missing-markers', code: source }
  }

  const jsonStart = startIndex + FLOW_START_MARKER.length
  const jsonText = source.slice(jsonStart, endIndex).trim()
  const generatedCode = extractGeneratedCode(source.slice(endIndex + FLOW_END_MARKER.length))

  // 防御：合法图形 JSON 必以对象起始；否则视为损坏（避免把误匹配的文本当 JSON 解析）。
  if (!jsonText.startsWith('{')) {
    return {
      ok: false,
      reason: 'invalid-json',
      code: generatedCode,
      error: '图形数据不是有效的 JSON 对象'
    }
  }

  try {
    return {
      ok: true,
      graph: JSON.parse(jsonText) as ReteGraphExport,
      code: generatedCode
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-json',
      code: generatedCode,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function extractGeneratedCode(tail: string): string {
  const markerIndex = tail.indexOf(GENERATED_CODE_MARKER)
  if (markerIndex < 0) return tail.replace(/^\s*\*\/\s*/, '').trim()
  return tail.slice(markerIndex + GENERATED_CODE_MARKER.length).trim()
}
