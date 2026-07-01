import type { NodeCategory } from '@shared/types'

interface CategoryMeta {
  key: NodeCategory
  name: string
  color: string
}

export const NODE_CATEGORIES: Record<NodeCategory, CategoryMeta> = {
  input: { key: 'input', name: '输入类', color: '#409eff' },
  transform: { key: 'transform', name: '转换类', color: '#22c55e' },
  split: { key: 'split', name: '分割类', color: '#f59e0b' },
  numeric: { key: 'numeric', name: '数值类', color: '#ef4444' },
  string: { key: 'string', name: '字符类', color: '#64748b' },
  compare: { key: 'compare', name: '比较类', color: '#0ea5e9' },
  logical: { key: 'logical', name: '逻辑类', color: '#14b8a6' },
  control: { key: 'control', name: '控制类', color: '#a855f7' },
  output: { key: 'output', name: '输出类', color: '#10b981' }
}
