/**
 * 内置示例组件 seeding 单测（seedSampleComponents）。
 *
 * 镜像 sample-script-seeding.test.ts 的模式，验证：
 * - 首次启动把 sampleDir/*.json 复制到 componentsDir
 * - 用户修改过的组件不被 bundled 更新覆盖
 * - 未修改的组件在 bundled 源变化时更新
 * - state 文件记录 baseline hash
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { seedSampleComponents } from '../electron/sampleScripts'

const tempDirs: string[] = []

function makeFixture(): { sampleDir: string; componentsDir: string; statePath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saecom-comp-seed-'))
  tempDirs.push(root)
  const sampleDir = path.join(root, 'samples', 'components')
  const componentsDir = path.join(root, 'script-components')
  fs.mkdirSync(sampleDir, { recursive: true })
  return { sampleDir, componentsDir, statePath: path.join(root, 'sample-components.json') }
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('bundled sample component seeding (seedSampleComponents)', () => {
  it('首次启动：复制 sampleDir/*.json 到 componentsDir', () => {
    const { sampleDir, componentsDir, statePath } = makeFixture()
    fs.writeFileSync(path.join(sampleDir, 'custom-a.json'), '{"key":"custom-a"}')
    fs.writeFileSync(path.join(sampleDir, 'custom-b.json'), '{"key":"custom-b"}')
    // 非 json 文件应被忽略
    fs.writeFileSync(path.join(sampleDir, 'readme.md'), '# ignore me')

    seedSampleComponents({ sampleDir, componentsDir, statePath })

    expect(fs.existsSync(path.join(componentsDir, 'custom-a.json'))).toBe(true)
    expect(fs.existsSync(path.join(componentsDir, 'custom-b.json'))).toBe(true)
    expect(fs.existsSync(path.join(componentsDir, 'readme.md'))).toBe(false)
    expect(fs.readFileSync(path.join(componentsDir, 'custom-a.json'), 'utf8')).toBe('{"key":"custom-a"}')

    // state 记录了 baseline
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.samples['custom-a.json'].seededSha256).toBe(hash('{"key":"custom-a"}'))
  })

  it('用户修改过的组件：bundled 更新时不覆盖', () => {
    const { sampleDir, componentsDir, statePath } = makeFixture()
    const src = path.join(sampleDir, 'custom-x.json')
    const dest = path.join(componentsDir, 'custom-x.json')
    fs.writeFileSync(src, '{"key":"custom-x","v":1}')

    // 首次 seed
    seedSampleComponents({ sampleDir, componentsDir, statePath })
    expect(fs.readFileSync(dest, 'utf8')).toBe('{"key":"custom-x","v":1}')

    // 用户修改了已 seed 的组件
    fs.writeFileSync(dest, '{"key":"custom-x","USER_EDIT":true}')

    // bundled 源更新到 v=2
    fs.writeFileSync(src, '{"key":"custom-x","v":2}')
    seedSampleComponents({ sampleDir, componentsDir, statePath })

    // 用户修改应被保留（不覆盖）
    expect(fs.readFileSync(dest, 'utf8')).toBe('{"key":"custom-x","USER_EDIT":true}')
  })

  it('未修改的组件：bundled 源变化时更新', () => {
    const { sampleDir, componentsDir, statePath } = makeFixture()
    const src = path.join(sampleDir, 'custom-y.json')
    const dest = path.join(componentsDir, 'custom-y.json')
    fs.writeFileSync(src, '{"key":"custom-y","v":1}')

    seedSampleComponents({ sampleDir, componentsDir, statePath })

    // bundled 源更新（用户未改本地副本）
    fs.writeFileSync(src, '{"key":"custom-y","v":2}')
    seedSampleComponents({ sampleDir, componentsDir, statePath })

    expect(fs.readFileSync(dest, 'utf8')).toBe('{"key":"custom-y","v":2}')
  })

  it('真实示例组件（shared/samples/components/*.json）可被 seed', () => {
    const { sampleDir, componentsDir, statePath } = makeFixture()
    // 用真实的 shared/samples/components 作源（验证实际 bundled 文件可 seeding）
    const realDir = path.resolve(__dirname, '../shared/samples/components')
    const realFiles = fs.readdirSync(realDir).filter((n) => n.endsWith('.json'))

    // 复制到 fixture 的 sampleDir（seedSampleComponents 接收任意 sampleDir）
    for (const f of realFiles) fs.copyFileSync(path.join(realDir, f), path.join(sampleDir, f))

    seedSampleComponents({ sampleDir, componentsDir, statePath })

    for (const f of realFiles) {
      expect(fs.existsSync(path.join(componentsDir, f)), `${f} 应被 seed`).toBe(true)
    }
    // 至少含 3 个示例组件
    expect(realFiles.length).toBeGreaterThanOrEqual(3)
  })
})
