import fs from 'node:fs'

/**
 * JSON 文件读写仓库。
 *
 * 从 main.ts 抽出的 loadJsonSafe/saveJsonSafe，行为完全一致：
 * 读失败返回 fallback；写失败 console.error 不抛（保持现有静默容忍）。
 */
export function loadJsonSafe<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

export function saveJsonSafe(file: string, data: unknown): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error(e)
  }
}
