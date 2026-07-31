import fs from 'node:fs'
import path from 'node:path'

function normalizeImportedScriptName(sourceName: string): string {
  const name = path.basename(String(sourceName || '')).trim().replace(/[/\\]/g, '')
  const base = name.replace(/\.js$/i, '')
  return `${base}.js`
}

export function findAvailableImportedScriptName(sourceName: string, existingNames: Iterable<string>): string {
  const normalized = normalizeImportedScriptName(sourceName)
  const base = normalized.replace(/\.js$/i, '')
  const taken = new Set(Array.from(existingNames, (name) => name.toLowerCase()))
  if (!taken.has(normalized.toLowerCase())) return normalized

  let index = 1
  while (taken.has(`${base} (${index}).js`.toLowerCase())) index++
  return `${base} (${index}).js`
}

export function importScriptFile(sourcePath: string, scriptsDir: string): { ok: true; name: string } | { ok: false; error: string } {
  try {
    fs.mkdirSync(scriptsDir, { recursive: true })
    const name = findAvailableImportedScriptName(path.basename(sourcePath), fs.readdirSync(scriptsDir))
    const content = fs.readFileSync(sourcePath, 'utf8')
    fs.writeFileSync(path.join(scriptsDir, name), content, { encoding: 'utf8', flag: 'wx' })
    return { ok: true, name }
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) }
  }
}
