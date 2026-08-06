/// <reference types="vite/client" />

declare module 'monaco-editor/language/typescript/monaco.contribution' {
  export const ScriptTarget: { ES2020: number }
  export const ModuleResolutionKind: { NodeJs: number }
  export const javascriptDefaults: {
    setCompilerOptions(options: {
      target?: number
      allowNonTsExtensions?: boolean
      moduleResolution?: number
      noLib?: boolean
      noEmit?: boolean
      allowJs?: boolean
      checkJs?: boolean
    }): void
    addExtraLib(content: string, filePath?: string): { dispose(): void }
  }
}
