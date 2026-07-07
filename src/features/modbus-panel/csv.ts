import type { ModbusBlock } from '@shared/types'

const HEADER = 'title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat'

function genId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 序列化区块为 CSV（不导出 id） */
export function serializeBlocksCsv(blocks: ModbusBlock[]): string {
  const rows = blocks.map((b) =>
    [b.title ?? '', b.slaveId, b.functionCode, b.startAddress, b.quantity, b.pollEnabled, b.pollIntervalMs, b.displayFormat]
      .map(csvEscape).join(',')
  )
  return [HEADER, ...rows].join('\n') + '\n'
}

function csvEscape(v: unknown): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 解析 CSV 为区块（重新生成 id，跳过非法行） */
export function parseBlocksCsv(csv: string): ModbusBlock[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0])
  const out: ModbusBlock[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    header.forEach((h, idx) => { row[h.trim()] = (cells[idx] ?? '').trim() })
    try {
      const block = rowToBlock(row)
      if (block) out.push(block)
    } catch { /* 跳过非法行 */ }
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else {
      if (c === ',') { result.push(cur); cur = '' }
      else if (c === '"') inQ = true
      else cur += c
    }
  }
  result.push(cur)
  return result
}

function rowToBlock(row: Record<string, string>): ModbusBlock | null {
  const slaveId = Number(row.slaveId)
  const functionCode = Number(row.functionCode) as 1 | 2 | 3 | 4
  const startAddress = Number(row.startAddress)
  const quantity = Number(row.quantity)
  const pollIntervalMs = row.pollIntervalMs ? Number(row.pollIntervalMs) : 1000
  const displayFormat = (row.displayFormat || 'unsigned') as ModbusBlock['displayFormat']

  if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new Error('bad slaveId')
  if (![1, 2, 3, 4].includes(functionCode)) throw new Error('bad fc')
  if (!Number.isFinite(startAddress) || startAddress < 0 || startAddress > 65535) throw new Error('bad addr')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) throw new Error('bad qty')

  return {
    id: genId(),
    title: row.title || undefined,
    slaveId, functionCode, startAddress, quantity,
    pollEnabled: row.pollEnabled === 'true',
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : 1000,
    displayFormat,
  }
}
