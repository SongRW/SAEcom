import { describe, expect, it, beforeEach } from 'vitest'
import { useOscilloscopeStore } from '../src/features/oscilloscope/store'

describe('oscilloscope store', () => {
  beforeEach(() => {
    useOscilloscopeStore.setState({
      openPaneId: null,
      panes: {},
      windowSec: 300
    })
  })

  it('opens a pane for a panel id with default config', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    const s = useOscilloscopeStore.getState()
    expect(s.openPaneId).toBe('COM3')
    expect(s.panes['COM3']).toBeDefined()
    expect(s.panes['COM3'].paused).toBe(false)
    expect(s.panes['COM3'].live).toBe(true)
  })

  it('opening an already-open pane just focuses it (no duplicate)', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    const first = useOscilloscopeStore.getState().panes['COM3']
    useOscilloscopeStore.getState().openPane('COM3')
    expect(Object.keys(useOscilloscopeStore.getState().panes)).toHaveLength(1)
    expect(useOscilloscopeStore.getState().panes['COM3']).toBe(first)
  })

  it('pause sets paused=true but keeps live state for resume', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().setPaused('COM3', true)
    expect(useOscilloscopeStore.getState().panes['COM3'].paused).toBe(true)
    expect(useOscilloscopeStore.getState().panes['COM3'].live).toBe(false)
  })

  it('toggleChannelVisibility flips visible', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().toggleChannelVisibility('COM3', 1)
    expect(useOscilloscopeStore.getState().panes['COM3'].channelVisible[1]).toBe(false)
  })

  it('setWindowSec updates windowSec', () => {
    useOscilloscopeStore.getState().setWindowSec(600)
    expect(useOscilloscopeStore.getState().windowSec).toBe(600)
  })

  it('closePane removes the pane', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().closePane('COM3')
    expect(useOscilloscopeStore.getState().panes['COM3']).toBeUndefined()
    expect(useOscilloscopeStore.getState().openPaneId).toBeNull()
  })
})

import { estimateMemoryMB } from '../src/features/oscilloscope/memEstimate'

describe('memory estimate', () => {
  it('computes MB from duration, rate, channels (4 bytes/sample/channel)', () => {
    // 300s * 1000/s * 4ch * 4B = 4_800_000 B ≈ 4.58 MB
    expect(estimateMemoryMB({ sec: 300, rate: 1000, channels: 4 })).toBeCloseTo(4.58, 1)
  })

  it('handles low rate gracefully', () => {
    expect(estimateMemoryMB({ sec: 300, rate: 10, channels: 2 })).toBeCloseTo(0.023, 2)
  })
})
