import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CustomComponentsRepository } from '../electron/repositories/custom-components.repository'

/** 临时目录隔离的仓库实例（userDataDir 注入，不污染真实用户数据）。 */
function makeRepo(): { repo: CustomComponentsRepository; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saecom-custom-components-test-'))
  return { repo: new CustomComponentsRepository(dir), dir }
}

const DESCRIPTOR = (key: string) => JSON.stringify(
  {
    key,
    name: '透传',
    description: '',
    category: 'custom',
    inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
    outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
    controls: [],
    sandboxApis: [],
    emit: 'return ""'
  },
  null,
  2
)

describe('CustomComponentsRepository.rename', () => {
  it('重命名时同步改写文件内 descriptor.key（防止保存回滚）', () => {
    const { repo, dir } = makeRepo()
    repo.write('custom-a.json', DESCRIPTOR('custom-a'))

    const res = repo.rename('custom-a.json', 'custom-b.json', 'custom-b')
    expect(res.ok).toBe(true)

    // 旧文件删除、新文件存在
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-a.json'))).toBe(false)
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-b.json'))).toBe(true)
    // 内容 key 已同步为新值
    const parsed = JSON.parse(fs.readFileSync(path.join(repo.getDir(), 'custom-b.json'), 'utf-8'))
    expect(parsed.key).toBe('custom-b')
  })

  it('不带 newKey 时仅改名（key 保持原值）', () => {
    const { repo, dir } = makeRepo()
    repo.write('custom-a.json', DESCRIPTOR('custom-a'))

    const res = repo.rename('custom-a.json', 'custom-b.json')
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(path.join(repo.getDir(), 'custom-b.json'), 'utf-8'))
    expect(parsed.key).toBe('custom-a')
  })

  it('非法 newKey 拒绝且不改文件', () => {
    const { repo, dir } = makeRepo()
    repo.write('custom-a.json', DESCRIPTOR('custom-a'))

    const res = repo.rename('custom-a.json', 'custom-b.json', 'bad key!')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('custom-xxx')
    // 原文件未被改动
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-a.json'))).toBe(true)
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-b.json'))).toBe(false)
  })

  it('目标已存在时拒绝（防覆盖）', () => {
    const { repo, dir } = makeRepo()
    repo.write('custom-a.json', DESCRIPTOR('custom-a'))
    repo.write('custom-b.json', DESCRIPTOR('custom-b'))

    const res = repo.rename('custom-a.json', 'custom-b.json', 'custom-b')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('已存在')
    // 两个文件都保留
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-a.json'))).toBe(true)
    expect(fs.existsSync(path.join(repo.getDir(), 'custom-b.json'))).toBe(true)
  })

  it('源不存在时报错', () => {
    const { repo } = makeRepo()
    const res = repo.rename('custom-nope.json', 'custom-b.json', 'custom-b')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('源组件不存在')
  })
})
