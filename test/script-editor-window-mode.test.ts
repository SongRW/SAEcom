import { describe, expect, it } from 'vitest'
import {
  createScriptEditorUiState,
  setWindowMode,
  nextWindowMode,
  restoreFromMinimized
} from '../src/features/script-editor/uiState'

describe('script editor window mode', () => {
  it('默认 normal，无 preMinimizeMode', () => {
    expect(createScriptEditorUiState().windowMode).toBe('normal')
    expect(createScriptEditorUiState().preMinimizeMode).toBe('normal')
  })

  it('setWindowMode 直接设置 windowMode', () => {
    const s = setWindowMode(createScriptEditorUiState(), 'maximized')
    expect(s.windowMode).toBe('maximized')
  })

  it('nextWindowMode: normal → maximized', () => {
    expect(nextWindowMode(createScriptEditorUiState()).windowMode).toBe('maximized')
  })

  it('nextWindowMode: maximized → normal（切换还原）', () => {
    const maximized = setWindowMode(createScriptEditorUiState(), 'maximized')
    expect(nextWindowMode(maximized).windowMode).toBe('normal')
  })

  it('nextWindowMode 进入 minimized 时记住 preMinimizeMode', () => {
    const maximized = setWindowMode(createScriptEditorUiState(), 'maximized')
    const minimized = nextWindowMode(maximized, 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('maximized')
  })

  it('nextWindowMode 从 normal 最小化，preMinimizeMode 记 normal', () => {
    const minimized = nextWindowMode(createScriptEditorUiState(), 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('normal')
  })

  it('restoreFromMinimized 回到 preMinimizeMode', () => {
    const minimized = nextWindowMode(setWindowMode(createScriptEditorUiState(), 'maximized'), 'minimize')
    expect(restoreFromMinimized(minimized).windowMode).toBe('maximized')
  })

  it('restoreFromMinimized 对非 minimized 态不变', () => {
    const normal = createScriptEditorUiState()
    expect(restoreFromMinimized(normal)).toBe(normal)
  })
})
