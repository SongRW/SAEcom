import { describe, expect, it } from 'vitest'
import { createDefaultNodeData, migrateNodeData, validateNodeConfig } from '../src/features/script-editor/panelConfig'

describe('transform-object panelConfig', () => {
  it('createDefaultNodeData returns empty keys array', () => {
    expect(createDefaultNodeData('transform-object')).toEqual({ keys: [] })
  })

  it('migrateNodeData preserves existing keys', () => {
    const data = { keys: [{ id: 'k1', name: 'temp' }] }
    expect(migrateNodeData('transform-object', data)).toEqual({ keys: [{ id: 'k1', name: 'temp' }] })
  })

  it('migrateNodeData coerces missing/invalid keys to empty array', () => {
    expect(migrateNodeData('transform-object', {})).toEqual({ keys: [] })
    expect(migrateNodeData('transform-object', { keys: 'not-an-array' })).toEqual({ keys: [] })
  })

  it('validateNodeConfig never blocks (empty/duplicate keys are valid JS)', () => {
    expect(validateNodeConfig('transform-object', { keys: [] })).toEqual([])
    expect(validateNodeConfig('transform-object', { keys: [{ id: 'k1', name: 'x' }, { id: 'k2', name: 'x' }] })).toEqual([])
  })
})
