import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { seedSampleScripts } from '../electron/sampleScripts'

const tempDirs: string[] = []

function makeFixture(): { sampleDir: string; scriptsDir: string; statePath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saecom-sample-seed-'))
  tempDirs.push(root)
  const sampleDir = path.join(root, 'samples')
  const scriptsDir = path.join(root, 'scripts')
  fs.mkdirSync(sampleDir)
  return { sampleDir, scriptsDir, statePath: path.join(root, 'sample-scripts.json') }
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('bundled sample seeding', () => {
  it('keeps user-modified scripts and data when bundled samples change', () => {
    const { sampleDir, scriptsDir, statePath } = makeFixture()
    const sourceScript = path.join(sampleDir, '示例.js')
    const sourceFrames = path.join(sampleDir, '示例.txt')
    fs.writeFileSync(sourceScript, '// @sample-version 1\nconst original = true\n')
    fs.writeFileSync(sourceFrames, 'ORIGINAL\n')

    seedSampleScripts({ sampleDir, scriptsDir, statePath })

    const savedScript = path.join(scriptsDir, '示例.js')
    const savedFrames = path.join(scriptsDir, '示例.txt')
    fs.writeFileSync(savedScript, '// user graph edit\n')
    fs.writeFileSync(savedFrames, 'USER FRAME\n')
    fs.writeFileSync(sourceScript, '// @sample-version 2\nconst original = false\n')
    fs.writeFileSync(sourceFrames, 'UPDATED\n')

    seedSampleScripts({ sampleDir, scriptsDir, statePath })

    expect(fs.readFileSync(savedScript, 'utf8')).toBe('// user graph edit\n')
    expect(fs.readFileSync(savedFrames, 'utf8')).toBe('USER FRAME\n')
  })

  it('updates an untouched tracked sample and advances its baseline hash', () => {
    const { sampleDir, scriptsDir, statePath } = makeFixture()
    const sourceScript = path.join(sampleDir, '协议.js')
    fs.writeFileSync(sourceScript, '// @sample-version 1\nconst version = 1\n')

    seedSampleScripts({ sampleDir, scriptsDir, statePath })
    fs.writeFileSync(sourceScript, '// @sample-version 2\nconst version = 2\n')

    seedSampleScripts({ sampleDir, scriptsDir, statePath })

    expect(fs.readFileSync(path.join(scriptsDir, '协议.js'), 'utf8')).toContain('version = 2')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.samples['协议.js'].seededSha256).toBe(hash('// @sample-version 2\nconst version = 2\n'))
  })

  it('preserves pre-manifest files that differ from the bundled source', () => {
    const { sampleDir, scriptsDir, statePath } = makeFixture()
    fs.mkdirSync(scriptsDir)
    fs.writeFileSync(path.join(sampleDir, '协议.js'), 'BUNDLED\n')
    fs.writeFileSync(path.join(scriptsDir, '协议.js'), 'EXISTING USER EDIT\n')

    seedSampleScripts({ sampleDir, scriptsDir, statePath })

    expect(fs.readFileSync(path.join(scriptsDir, '协议.js'), 'utf8')).toBe('EXISTING USER EDIT\n')
    expect(fs.existsSync(statePath)).toBe(false)
  })
})
