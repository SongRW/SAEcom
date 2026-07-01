/**
 * 宽松多通道解析器。移植自老示波器的正则 /-?\d+(\.\d+)?/g（renderer.js:4168），
 * 但保留通道序号：逗号/空白分隔的第 N 个数字 = CH N。
 * 鲁棒优先：任何数字流都能画，不假设格式。
 */

/** 通道数上限。超出按序号截断。 */
export const MAX_CHANNELS = 8

/** 抓数字的宽松正则（与老示波器一致） */
const NUM_RE = /-?\d+(?:\.\d+)?/g

/** 从一段文本中提取所有数字，截断到 MAX_CHANNELS 通道 */
export function extractSamples(text: string): number[] {
  const out: number[] = []
  let m: RegExpExecArray | null
  NUM_RE.lastIndex = 0
  while ((m = NUM_RE.exec(text)) !== null) {
    out.push(parseFloat(m[0]))
    if (out.length >= MAX_CHANNELS) break
  }
  return out
}

/**
 * 解析一个数据块（可能含多行）。按行切分，每行提取一组通道值。
 * 空行（无数字）被丢弃。
 * 返回的每组对应一个时间戳下的多通道样本。
 */
export function parseChunk(chunk: string): number[][] {
  const lines = chunk.split(/\r?\n/)
  const sets: number[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const samples = extractSamples(line)
    if (samples.length > 0) sets.push(samples)
  }
  return sets
}
