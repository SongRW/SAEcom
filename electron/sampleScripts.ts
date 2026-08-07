import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

interface SampleSeedRecord {
  sourceVersion?: string
  seededSha256: string
}

interface SampleSeedState {
  schemaVersion: 1
  samples: Record<string, SampleSeedRecord>
}

export interface SeedSampleScriptsOptions {
  sampleDir: string
  scriptsDir: string
  statePath: string
}

const SAMPLE_VERSION_RE = /@sample-version\s+(\d+)/

/**
 * 内置示例 seeding 核心：把 sampleDir 下指定扩展名的文件复制到 destDir，
 * 用 hash 去重 + 保护用户修改（与 bundled baseline 对比，用户改过的不覆盖）。
 *
 * 脚本（.js/.txt）与组件（.json）共用此逻辑，仅扩展名与 state 文件不同。
 */
function seedBundledSamples(
  sampleDir: string,
  destDir: string,
  statePath: string,
  extensions: string[]
): void {
  fs.mkdirSync(destDir, { recursive: true })
  const state = readSeedState(statePath)
  let changed = false

  let entries: string[] = []
  try {
    entries = fs.readdirSync(sampleDir).filter((name) => extensions.some((ext) => name.endsWith(ext)))
  } catch {
    return
  }

  for (const name of entries) {
    const sourcePath = path.join(sampleDir, name)
    const destinationPath = path.join(destDir, name)
    let source: Buffer
    try {
      source = fs.readFileSync(sourcePath)
    } catch {
      continue
    }
    const sourceHash = sha256(source)
    const record = state.samples[name]

    if (!fs.existsSync(destinationPath)) {
      if (copySample(sourcePath, destinationPath)) {
        state.samples[name] = sampleRecord(source, sourceHash)
        changed = true
      }
      continue
    }

    if (!record) {
      // Existing installs without a baseline are never overwritten unless their copy
      // is byte-identical to the current bundled source.
      if (sameHash(destinationPath, sourceHash)) {
        state.samples[name] = sampleRecord(source, sourceHash)
        changed = true
      }
      continue
    }

    // Once a user changes a seeded file, retain that file and its last known
    // bundled baseline. Future starts compare it against the same baseline.
    if (!sameHash(destinationPath, record.seededSha256)) continue
    if (record.seededSha256 === sourceHash) continue

    if (copySample(sourcePath, destinationPath)) {
      state.samples[name] = sampleRecord(source, sourceHash)
      changed = true
    }
  }

  if (changed) writeSeedState(statePath, state)
}

export function seedSampleScripts({ sampleDir, scriptsDir, statePath }: SeedSampleScriptsOptions): void {
  seedBundledSamples(sampleDir, scriptsDir, statePath, ['.js', '.txt'])
}

/**
 * 内置示例组件 seeding：把 shared/samples/components/*.json 复制到
 * userData/script-components/，机制与脚本 seeding 一致（hash 去重 + 用户修改保护）。
 * state 单独存 sample-components.json，与脚本的 sample-scripts.json 隔离。
 */
export function seedSampleComponents({ sampleDir, componentsDir, statePath }: {
  sampleDir: string
  componentsDir: string
  statePath: string
}): void {
  seedBundledSamples(sampleDir, componentsDir, statePath, ['.json'])
}

function sampleRecord(source: Buffer, seededSha256: string): SampleSeedRecord {
  return {
    seededSha256,
    sourceVersion: source.toString('utf8').match(SAMPLE_VERSION_RE)?.[1]
  }
}

function readSeedState(statePath: string): SampleSeedState {
  try {
    const value = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<SampleSeedState>
    if (value.schemaVersion !== 1 || !value.samples || typeof value.samples !== 'object') throw new Error('invalid state')
    return { schemaVersion: 1, samples: value.samples }
  } catch {
    return { schemaVersion: 1, samples: {} }
  }
}

function writeSeedState(statePath: string, state: SampleSeedState): void {
  const tempPath = `${statePath}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8')
    fs.renameSync(tempPath, statePath)
  } catch (error) {
    try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
    console.error('[seedSampleScripts] state write failed', error)
  }
}

function copySample(sourcePath: string, destinationPath: string): boolean {
  try {
    fs.copyFileSync(sourcePath, destinationPath)
    return true
  } catch (error) {
    console.error('[seedSampleScripts] copy failed', path.basename(sourcePath), error)
    return false
  }
}

function sameHash(filePath: string, expected: string): boolean {
  try {
    return sha256(fs.readFileSync(filePath)) === expected
  } catch {
    return false
  }
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
