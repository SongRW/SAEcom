import { create } from 'zustand'

interface ScriptEditorState {
  activeScriptName: string | null
  runningScriptId: string | null
  outputLines: string[]
  setActiveScriptName: (name: string | null) => void
  setRunningScriptId: (id: string | null) => void
  appendOutputLine: (line: string) => void
  clearOutput: () => void
}

export const useScriptEditorStore = create<ScriptEditorState>((set) => ({
  activeScriptName: null,
  runningScriptId: null,
  outputLines: [],
  setActiveScriptName: (activeScriptName) => set({ activeScriptName }),
  setRunningScriptId: (runningScriptId) => set({ runningScriptId }),
  appendOutputLine: (line) => set((state) => ({ outputLines: [...state.outputLines, line] })),
  clearOutput: () => set({ outputLines: [] })
}))
