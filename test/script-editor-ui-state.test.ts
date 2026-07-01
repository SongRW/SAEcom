import { describe, expect, it } from 'vitest'
import {
  closeConfig,
  closeSidePanel,
  createScriptEditorUiState,
  onNodeDeleted,
  onNodeDoubleClick,
  onScriptRunStarted,
  onSelectedNodeDeleted,
  openSidePanel,
  setCanvasTool,
  toggleScriptOutput,
  toggleSidePanel
} from '../src/features/script-editor/uiState'

describe('script editor UI state', () => {
  it('starts with no side panel, config closed, output collapsed, pointer tool', () => {
    expect(createScriptEditorUiState()).toMatchObject({
      sidePanel: null,
      configOpen: false,
      outputExpanded: false,
      canvasTool: 'pointer'
    })
  })

  it('toggles a first-level side panel open and closed', () => {
    let state = toggleSidePanel(createScriptEditorUiState(), 'components')
    expect(state.sidePanel).toBe('components')
    state = toggleSidePanel(state, 'components')
    expect(state.sidePanel).toBeNull()
  })

  it('switches the side panel between first-level items', () => {
    let state = toggleSidePanel(createScriptEditorUiState(), 'components')
    state = toggleSidePanel(state, 'scripts')
    expect(state.sidePanel).toBe('scripts')
  })

  it('force-opens a side panel without toggling it off', () => {
    let state = openSidePanel(createScriptEditorUiState(), 'components')
    expect(state.sidePanel).toBe('components')
    state = openSidePanel(state, 'components')
    expect(state.sidePanel).toBe('components')
  })

  it('closes the side panel', () => {
    const state = closeSidePanel(toggleSidePanel(createScriptEditorUiState(), 'scripts'))
    expect(state.sidePanel).toBeNull()
  })

  it('opens the config drawer on node double-click and closes it on request', () => {
    const opened = onNodeDoubleClick(createScriptEditorUiState())
    expect(opened.configOpen).toBe(true)
    expect(closeConfig(opened).configOpen).toBe(false)
  })

  it('closes the config drawer when the selected node is deleted', () => {
    expect(onSelectedNodeDeleted(onNodeDoubleClick(createScriptEditorUiState())).configOpen).toBe(false)
    expect(onNodeDeleted(onNodeDoubleClick(createScriptEditorUiState())).configOpen).toBe(false)
  })

  it('keeps the side panel intact when opening config', () => {
    const state = onNodeDoubleClick(toggleSidePanel(createScriptEditorUiState(), 'components'))
    expect(state.sidePanel).toBe('components')
    expect(state.configOpen).toBe(true)
  })

  it('switches canvas mouse operation modes', () => {
    let state = setCanvasTool(createScriptEditorUiState(), 'pan')
    expect(state.canvasTool).toBe('pan')
    state = setCanvasTool(state, 'select')
    expect(state.canvasTool).toBe('select')
  })

  it('expands output when a script starts running', () => {
    expect(onScriptRunStarted(createScriptEditorUiState()).outputExpanded).toBe(true)
  })

  it('toggles output independently', () => {
    let state = toggleScriptOutput(createScriptEditorUiState())
    expect(state.outputExpanded).toBe(true)
    state = toggleScriptOutput(state)
    expect(state.outputExpanded).toBe(false)
  })
})
