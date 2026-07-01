import { describe, expect, it } from 'vitest'
import { SCRIPT_NODE_OPEN_CONFIG_EVENT } from '../src/features/script-editor/nodeInteraction'

describe('script editor node interaction', () => {
  it('uses a stable custom event for node config opening', () => {
    expect(SCRIPT_NODE_OPEN_CONFIG_EVENT).toBe('saecom:script-node-open-config')
  })
})
