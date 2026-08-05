import { describe, expect, it } from 'vitest'
import {
  concatPortCount,
  concatPortKey,
  isConcatNode,
  MIN_CONCAT_PORTS,
  resolveNodePorts
} from '../src/features/script-editor/rete/dynamicPorts'

describe('concat dynamic port helpers', () => {
  describe('concatPortKey', () => {
    it('maps 0-25 to lowercase letters a-z', () => {
      expect(concatPortKey(0)).toBe('a')
      expect(concatPortKey(1)).toBe('b')
      expect(concatPortKey(25)).toBe('z')
    })

    it('falls back to in_N for indices past z', () => {
      expect(concatPortKey(26)).toBe('in_27')
      expect(concatPortKey(27)).toBe('in_28')
      expect(concatPortKey(50)).toBe('in_51')
    })

    it('never collides between letter and numeric ranges', () => {
      const keys = new Set<string>()
      for (let i = 0; i < 40; i += 1) keys.add(concatPortKey(i))
      expect(keys.size).toBe(40)
    })
  })

  describe('concatPortCount', () => {
    it('returns the stored port count when valid', () => {
      expect(concatPortCount({ ports: 2 })).toBe(2)
      expect(concatPortCount({ ports: 5 })).toBe(5)
    })

    it('floors to MIN_CONCAT_PORTS when missing or invalid', () => {
      expect(concatPortCount({})).toBe(MIN_CONCAT_PORTS)
      expect(concatPortCount({ ports: undefined })).toBe(MIN_CONCAT_PORTS)
      expect(concatPortCount({ ports: NaN })).toBe(MIN_CONCAT_PORTS)
      expect(concatPortCount({ ports: 'abc' })).toBe(MIN_CONCAT_PORTS)
    })

    it('clamps below-floor values back to MIN_CONCAT_PORTS', () => {
      expect(concatPortCount({ ports: 0 })).toBe(MIN_CONCAT_PORTS)
      expect(concatPortCount({ ports: 1 })).toBe(MIN_CONCAT_PORTS)
      expect(concatPortCount({ ports: -3 })).toBe(MIN_CONCAT_PORTS)
    })

    it('floors fractional counts', () => {
      expect(concatPortCount({ ports: 3.9 })).toBe(3)
    })
  })

  describe('isConcatNode', () => {
    it('recognizes protocol-concat, string-concat and script-expr', () => {
      expect(isConcatNode('protocol-concat')).toBe(true)
      expect(isConcatNode('string-concat')).toBe(true)
      expect(isConcatNode('script-expr')).toBe(true)
    })

    it('rejects other keys and undefined', () => {
      expect(isConcatNode('transform-object')).toBe(false)
      expect(isConcatNode('output-log')).toBe(false)
      expect(isConcatNode(undefined)).toBe(false)
    })
  })

  describe('resolveNodePorts for concat nodes', () => {
    it('derives letter-named inputs from data.ports for protocol-concat', () => {
      const { inputs, outputs } = resolveNodePorts('protocol-concat', { ports: 3 })
      expect(inputs.map((p) => p.key)).toEqual(['a', 'b', 'c'])
      expect(inputs.map((p) => p.label)).toEqual(['A', 'B', 'C'])
      expect(inputs.every((p) => p.socket === 'dataSocket')).toBe(true)
      expect(outputs).toHaveLength(1)
    })

    it('derives letter-named inputs from data.ports for string-concat', () => {
      const { inputs } = resolveNodePorts('string-concat', { ports: 4 })
      expect(inputs.map((p) => p.key)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('defaults to MIN_CONCAT_PORTS when data.ports is absent', () => {
      const { inputs } = resolveNodePorts('protocol-concat', {})
      expect(inputs).toHaveLength(MIN_CONCAT_PORTS)
    })

    it('falls back to in_N ports past z', () => {
      const { inputs } = resolveNodePorts('protocol-concat', { ports: 28 })
      expect(inputs).toHaveLength(28)
      expect(inputs[25]!.key).toBe('z')
      expect(inputs[26]!.key).toBe('in_27')
      expect(inputs[27]!.key).toBe('in_28')
    })
  })
})
