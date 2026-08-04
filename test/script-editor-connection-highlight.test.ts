import { describe, expect, it } from 'vitest'
import { computeConnectionHighlight } from '../src/features/script-editor/components/GraphCanvas'

describe('computeConnectionHighlight', () => {
  const selectedA = new Set(['node-a'])

  it('marks an outgoing connection (source selected) as out', () => {
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, selectedA))
      .toEqual({ endpoint: true, direction: 'out' })
  })

  it('marks an incoming connection (target selected) as in', () => {
    expect(computeConnectionHighlight({ source: 'node-b', target: 'node-a' }, selectedA))
      .toEqual({ endpoint: true, direction: 'in' })
  })

  it('marks a both-endpoints connection as both (deterministic single direction)', () => {
    const both = new Set(['node-a', 'node-b'])
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, both))
      .toEqual({ endpoint: true, direction: 'both' })
  })

  it('marks a both-endpoints connection as both regardless of which side is source', () => {
    const both = new Set(['node-a', 'node-b'])
    expect(computeConnectionHighlight({ source: 'node-b', target: 'node-a' }, both))
      .toEqual({ endpoint: true, direction: 'both' })
  })

  it('does not highlight a connection unrelated to the selection', () => {
    expect(computeConnectionHighlight({ source: 'node-c', target: 'node-d' }, selectedA))
      .toEqual({ endpoint: false, direction: null })
  })

  it('does not highlight anything when selection is empty', () => {
    const empty = new Set<string>()
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, empty))
      .toEqual({ endpoint: false, direction: null })
  })

  it('supports multi-node selection: highlights incident connections independently', () => {
    const selected = new Set(['node-a', 'node-c'])
    // a -> b : a is selected → out
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, selected))
      .toEqual({ endpoint: true, direction: 'out' })
    // b -> c : c is selected → in
    expect(computeConnectionHighlight({ source: 'node-b', target: 'node-c' }, selected))
      .toEqual({ endpoint: true, direction: 'in' })
    // a -> c : both selected → both
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-c' }, selected))
      .toEqual({ endpoint: true, direction: 'both' })
    // b -> d : neither selected → none
    expect(computeConnectionHighlight({ source: 'node-b', target: 'node-d' }, selected))
      .toEqual({ endpoint: false, direction: null })
  })
})
