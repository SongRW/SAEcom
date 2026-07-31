import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findAvailableImportedScriptName, importScriptFile } from '../electron/scriptImport'

const tempDirs: string[] = []

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saecom-script-import-'))
  tempDirs.push(root)
  const scriptsDir = path.join(root, 'scripts')
  const sourcePath = path.join(root, '外部脚本.js')
  fs.writeFileSync(sourcePath, 'const imported = true\n', 'utf8')
  return { root, scriptsDir, sourcePath }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('script import', () => {
  it('uses the source .js file name when available', () => {
    expect(findAvailableImportedScriptName('外部脚本.js', [])).toBe('外部脚本.js')
  })

  it('creates the first unused numbered copy name', () => {
    expect(findAvailableImportedScriptName('外部脚本.js', [
      '外部脚本.js',
      '外部脚本 (1).js',
      '外部脚本 (2).js'
    ])).toBe('外部脚本 (3).js')
  })

  it('normalizes an uppercase extension to .js', () => {
    expect(findAvailableImportedScriptName('外部脚本.JS', [])).toBe('外部脚本.js')
  })

  it('adds .js when the source name has no extension', () => {
    expect(findAvailableImportedScriptName('外部脚本', [])).toBe('外部脚本.js')
  })

  it('copies UTF-8 source text to the first available script name', () => {
    const { scriptsDir, sourcePath } = makeFixture()
    fs.mkdirSync(scriptsDir)
    fs.writeFileSync(path.join(scriptsDir, '外部脚本.js'), 'existing\n', 'utf8')

    expect(importScriptFile(sourcePath, scriptsDir)).toEqual({ ok: true, name: '外部脚本 (1).js' })
    expect(fs.readFileSync(path.join(scriptsDir, '外部脚本 (1).js'), 'utf8')).toBe('const imported = true\n')
    expect(fs.readFileSync(path.join(scriptsDir, '外部脚本.js'), 'utf8')).toBe('existing\n')
  })

  it('returns a read error without creating a destination', () => {
    const { scriptsDir, root } = makeFixture()
    expect(importScriptFile(path.join(root, 'missing.js'), scriptsDir).ok).toBe(false)
    expect(fs.existsSync(scriptsDir)).toBe(true)
    expect(fs.readdirSync(scriptsDir)).toEqual([])
  })
})
