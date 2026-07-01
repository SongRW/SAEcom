import { describe, expect, it } from 'vitest'
import {
  FLOW_END_MARKER,
  FLOW_START_MARKER,
  buildScriptFile,
  parseScriptFile
} from '../src/features/script-editor/persistence'
import type { ReteGraphExport } from '../shared/types'

const sampleGraph: ReteGraphExport = {
  nodes: [
    { id: '1', key: 'input-manual', data: { content: 'hello' } },
    { id: '2', key: 'output-log', data: { prefix: 'Result' } }
  ],
  connections: [
    { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
  ]
}

describe('Rete script persistence', () => {
  it('builds a script file with flow markers and generated code', () => {
    const content = buildScriptFile(sampleGraph, 'console.log("generated")')

    expect(content).toContain(`/* ${FLOW_START_MARKER}`)
    expect(content).toContain(FLOW_END_MARKER)
    expect(content).toContain('// Generated code:')
    expect(content).toContain('console.log("generated")')
  })

  it('round-trips graph data from a generated script file', () => {
    const content = buildScriptFile(sampleGraph, 'console.log("generated")')
    const parsed = parseScriptFile(content)

    if (!parsed.ok) throw new Error(`Expected parse success, got ${parsed.reason}`)
    expect(parsed.graph).toEqual(sampleGraph)
    expect(parsed.code).toBe('console.log("generated")')
  })

  it('reports an empty flow when markers are absent', () => {
    const parsed = parseScriptFile('console.log("plain script")')

    if (parsed.ok) throw new Error('Expected parse failure for missing markers')
    expect(parsed.reason).toBe('missing-markers')
    expect(parsed.code).toBe('console.log("plain script")')
  })

  it('reports invalid JSON between markers', () => {
    const parsed = parseScriptFile(`/* ${FLOW_START_MARKER}\nnot json\n${FLOW_END_MARKER} */\n// Generated code:\nconsole.log(1)`)

    if (parsed.ok) throw new Error('Expected parse failure for invalid JSON')
    expect(parsed.reason).toBe('invalid-json')
  })
})
