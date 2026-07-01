export type ScriptEditorSidePanel = 'components' | 'scripts'
export type CanvasTool = 'pointer' | 'select' | 'pan'
export type ScriptEditorWindowMode = 'normal' | 'maximized' | 'minimized'

export interface ScriptEditorUiState {
  sidePanel: ScriptEditorSidePanel | null
  configOpen: boolean
  outputExpanded: boolean
  canvasTool: CanvasTool
  windowMode: ScriptEditorWindowMode
  preMinimizeMode: Exclude<ScriptEditorWindowMode, 'minimized'>
}

export function createScriptEditorUiState(): ScriptEditorUiState {
  return {
    sidePanel: null,
    configOpen: false,
    outputExpanded: false,
    canvasTool: 'pointer',
    windowMode: 'normal',
    preMinimizeMode: 'normal'
  }
}

export function toggleSidePanel(state: ScriptEditorUiState, panel: ScriptEditorSidePanel): ScriptEditorUiState {
  return {
    ...state,
    sidePanel: state.sidePanel === panel ? null : panel
  }
}

export function openSidePanel(state: ScriptEditorUiState, panel: ScriptEditorSidePanel): ScriptEditorUiState {
  return {
    ...state,
    sidePanel: panel
  }
}

export function closeSidePanel(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    sidePanel: null
  }
}

export function onNodeDoubleClick(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    configOpen: true
  }
}

export function closeConfig(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    configOpen: false
  }
}

export function onNodeDeleted(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    configOpen: false
  }
}

export function onSelectedNodeDeleted(state: ScriptEditorUiState): ScriptEditorUiState {
  return onNodeDeleted(state)
}

export function setCanvasTool(state: ScriptEditorUiState, canvasTool: CanvasTool): ScriptEditorUiState {
  return {
    ...state,
    canvasTool
  }
}

export function onScriptRunStarted(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    outputExpanded: true
  }
}

export function toggleScriptOutput(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    outputExpanded: !state.outputExpanded
  }
}

/** 直接设置 windowMode（用于最大化切换等）。不写 preMinimizeMode。 */
export function setWindowMode(state: ScriptEditorUiState, windowMode: ScriptEditorWindowMode): ScriptEditorUiState {
  return { ...state, windowMode }
}

/**
 * 窗口模式切换。
 * - 不带 action：normal ↔ maximized 互切（最大化按钮行为）。
 * - action='minimize'：进入 minimized，并把当前 windowMode（normal/maximized）记到 preMinimizeMode。
 */
export function nextWindowMode(
  state: ScriptEditorUiState,
  action: 'minimize' | undefined = undefined
): ScriptEditorUiState {
  if (action === 'minimize') {
    const pre = state.windowMode === 'maximized' ? 'maximized' : 'normal'
    return { ...state, windowMode: 'minimized', preMinimizeMode: pre }
  }
  // normal ↔ maximized 互切
  return { ...state, windowMode: state.windowMode === 'maximized' ? 'normal' : 'maximized' }
}

/** 从 minimized 还原到 preMinimizeMode；非 minimized 态原样返回。 */
export function restoreFromMinimized(state: ScriptEditorUiState): ScriptEditorUiState {
  if (state.windowMode !== 'minimized') return state
  return { ...state, windowMode: state.preMinimizeMode }
}
