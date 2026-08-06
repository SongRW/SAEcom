import { describe, expect, it } from 'vitest'
import {
  cloneDescriptor,
  createEmptyDescriptor,
  formatDiagnostics,
  mockControlValues,
  sandboxApisError,
  shouldResetForm
} from '@/features/script-editor/nodes/component/customComponentForm'
import {
  normalizeComponentFileName,
  stripJsonExtension
} from '@/features/script-editor/components/CustomComponentPanel'
import type { Diagnostic } from '@/features/script-editor/nodes/component/validate'

describe('customComponentForm 纯辅助', () => {
  it('createEmptyDescriptor 产出合法骨架（带默认端口与模板 emit）', () => {
    const d = createEmptyDescriptor()
    expect(d.key).toBe('custom-')
    expect(d.category).toBe('custom')
    expect(d.inputs).toHaveLength(1)
    expect(d.inputs[0].key).toBe('in')
    expect(d.outputs[0].key).toBe('out')
    expect(d.emit).toContain('outVar')
  })

  it('cloneDescriptor 深拷贝（修改副本不影响原件）', () => {
    const original = createEmptyDescriptor()
    original.inputs.push({ key: 'extra', socket: 'dataSocket' })
    const copy = cloneDescriptor(original)
    copy.inputs[0].key = 'changed'
    copy.key = 'custom-other'
    // 副本改了，原件保持不变
    expect(original.inputs[0].key).toBe('in')
    expect(original.key).toBe('custom-')
    expect(original.inputs).toHaveLength(2)
    expect(copy.inputs[0].key).toBe('changed')
  })

  it('mockControlValues 用 default / select 首项 / 类型零值回退', () => {
    const values = mockControlValues([
      { key: 'a', type: 'text', label: 'A', default: 'hello' },
      { key: 'b', type: 'select', label: 'B', options: ['x', 'y'] },
      { key: 'c', type: 'number', label: 'C' },
      { key: 'd', type: 'boolean', label: 'D' },
      { key: 'e', type: 'text', label: 'E' }
    ])
    expect(values).toEqual({
      a: 'hello',
      b: 'x',
      c: 0,
      d: false,
      e: ''
    })
  })

  it('sandboxApisError 已知 API 返回 undefined', () => {
    expect(sandboxApisError(['send', 'sleep', 'console'])).toBeUndefined()
  })

  it('sandboxApisError 未知 API 列在错误文案里', () => {
    const msg = sandboxApisError(['send', 'doesNotExist', 'alsoFake'])
    expect(msg).toContain('doesNotExist')
    expect(msg).toContain('alsoFake')
    expect(msg).not.toContain('send')
  })

  it('formatDiagnostics 把诊断列表格式化为 [field] message', () => {
    const errors: Diagnostic[] = [
      { severity: 'error', field: 'key', message: 'key 必填' },
      { severity: 'warning', field: 'emit', message: '建议补声明' }
    ]
    const text = formatDiagnostics(errors)
    expect(text).toContain('[key] key 必填')
    expect(text).toContain('[emit] 建议补声明')
  })

  it('formatDiagnostics 无 field 时用 root 占位', () => {
    const text = formatDiagnostics([{ severity: 'error', message: '描述符必须是对象' }])
    expect(text).toBe('[root] 描述符必须是对象')
  })

  it('shouldResetForm 仅在 open 边沿或切换编辑目标时重置（回归：父组件重渲染不重置）', () => {
    // 打开瞬间（false→true 边沿）→ 重置
    expect(shouldResetForm(true, false, null, null)).toBe(true)
    // 打开状态下父组件重渲染（open 不变、目标不变）→ 不重置
    expect(shouldResetForm(true, true, null, null)).toBe(false)
    // 编辑目标 A → B → 重置
    expect(shouldResetForm(true, true, 'custom-b.json', 'custom-a.json')).toBe(true)
    // 编辑目标不变 → 不重置
    expect(shouldResetForm(true, true, 'custom-a.json', 'custom-a.json')).toBe(false)
    // 关闭状态 → 不重置
    expect(shouldResetForm(false, true, null, null)).toBe(false)
  })
})

describe('CustomComponentPanel 文件名辅助', () => {
  it('stripJsonExtension 去掉 .json 后缀', () => {
    expect(stripJsonExtension('custom-foo.json')).toBe('custom-foo')
    expect(stripJsonExtension('custom-foo')).toBe('custom-foo')
    // 大写后缀也支持
    expect(stripJsonExtension('custom-foo.JSON')).toBe('custom-foo')
  })

  it('normalizeComponentFileName 强制 .json 后缀 + 剥离非法字符', () => {
    expect(normalizeComponentFileName('custom-foo')).toBe('custom-foo.json')
    expect(normalizeComponentFileName('custom-foo.json')).toBe('custom-foo.json')
    // 剥离路径分隔符与 Windows 非法字符
    expect(normalizeComponentFileName('custom/bad:name')).toBe('custombadname.json')
  })

  it('normalizeComponentFileName 拒绝空名/点目录', () => {
    expect(normalizeComponentFileName('   ')).toBeNull()
    expect(normalizeComponentFileName('.')).toBeNull()
    expect(normalizeComponentFileName('..')).toBeNull()
  })
})
