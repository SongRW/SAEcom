import { describe, expect, it } from 'vitest'
import {
  createScriptEditorUiState,
  setWindowMode,
  nextWindowMode,
  restoreFromMinimized
} from '../src/features/script-editor/uiState'

describe('script editor window mode', () => {
  it('默认 maximized（打开即最大化），preMinimizeMode 同步为 maximized', () => {
    expect(createScriptEditorUiState().windowMode).toBe('maximized')
    expect(createScriptEditorUiState().preMinimizeMode).toBe('maximized')
  })

  it('setWindowMode 直接设置 windowMode', () => {
    const s = setWindowMode(createScriptEditorUiState(), 'normal')
    expect(s.windowMode).toBe('normal')
  })

  it('nextWindowMode: maximized → normal（默认态点还原）', () => {
    expect(nextWindowMode(createScriptEditorUiState()).windowMode).toBe('normal')
  })

  it('nextWindowMode: normal → maximized（从 normal 点最大化）', () => {
    const normal = setWindowMode(createScriptEditorUiState(), 'normal')
    expect(nextWindowMode(normal).windowMode).toBe('maximized')
  })

  it('nextWindowMode 进入 minimized 时记住 preMinimizeMode', () => {
    const minimized = nextWindowMode(createScriptEditorUiState(), 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('maximized')
  })

  it('nextWindowMode 从 normal 最小化，preMinimizeMode 记 normal', () => {
    const normal = setWindowMode(createScriptEditorUiState(), 'normal')
    const minimized = nextWindowMode(normal, 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('normal')
  })

  it('restoreFromMinimized 回到 preMinimizeMode', () => {
    const minimized = nextWindowMode(createScriptEditorUiState(), 'minimize')
    expect(restoreFromMinimized(minimized).windowMode).toBe('maximized')
  })

  it('restoreFromMinimized 对非 minimized 态不变', () => {
    const maximized = createScriptEditorUiState()
    expect(restoreFromMinimized(maximized)).toBe(maximized)
  })
})
