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

export function seedSampleScripts({ sampleDir, scriptsDir, statePath }: SeedSampleScriptsOptions): void {
  fs.mkdirSync(scriptsDir, { recursive: true })
  const state = readSeedState(statePath)
  let changed = false

  let entries: string[] = []
  try {
    entries = fs.readdirSync(sampleDir).filter((name) => name.endsWith('.js') || name.endsWith('.txt'))
  } catch {
    return
  }

  for (const name of entries) {
    const sourcePath = path.join(sampleDir, name)
    const destinationPath = path.join(scriptsDir, name)
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
