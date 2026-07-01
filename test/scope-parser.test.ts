import { describe, expect, it } from 'vitest'
import { parseChunk, extractSamples, MAX_CHANNELS } from '../src/features/oscilloscope/parser'

describe('scope parser', () => {
  it('extracts numbers from a single-number line', () => {
    expect(extractSamples('25.5\r\n')).toEqual([25.5])
  })

  it('splits comma-separated values into ordered channels', () => {
    expect(extractSamples('1.23,4.56,7.89')).toEqual([1.23, 4.56, 7.89])
  })

  it('splits whitespace-separated values into ordered channels', () => {
    expect(extractSamples('1 2 3')).toEqual([1, 2, 3])
  })

  it('extracts numbers from key:value text but loses the key (by design)', () => {
    // 宽松正则：只取数字，key 丢弃。符合"任何数字流都能画"的鲁棒目标。
    expect(extractSamples('temp:25.5 humi:60')).toEqual([25.5, 60])
  })

  it('ignores non-numeric text', () => {
    expect(extractSamples('hello world')).toEqual([])
  })

  it('handles negative numbers', () => {
    expect(extractSamples('-1.5,-2.5')).toEqual([-1.5, -2.5])
  })

  it('caps channel count at MAX_CHANNELS', () => {
    const many = Array.from({ length: MAX_CHANNELS + 3 }, (_, i) => i).join(',')
    expect(extractSamples(many)).toHaveLength(MAX_CHANNELS)
  })

  it('parseChunk yields one sample set per line, returning non-empty lines', () => {
    const sets = parseChunk('1,2\r\n3\r\nno-numbers\r\n4,5,6')
    expect(sets).toEqual([[1, 2], [3], [4, 5, 6]])
  })

  it('parseChunk handles chunk without trailing newline', () => {
    expect(parseChunk('1.1,2.2')).toEqual([[1.1, 2.2]])
  })
})
