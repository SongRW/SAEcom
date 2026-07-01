import type { ClassicPreset, GetSchemes } from 'rete'
import type { Area2D } from 'rete-area-plugin'
import type { MinimapExtra } from 'rete-minimap-plugin'
import type { Connection } from 'rete-connection-plugin'
import type { ReactArea2D } from 'rete-react-plugin'

export type ScriptNode = ClassicPreset.Node & {
  width: number
  height: number
  parent?: string
  key?: string
  data?: Record<string, unknown>
  onDataChange?: (key: string, value: unknown) => void
}
export type ScriptConnection = ClassicPreset.Connection<ScriptNode, ScriptNode> & Connection
export type ScriptSchemes = GetSchemes<ScriptNode, ScriptConnection>
export type ScriptAreaExtra = Area2D<ScriptSchemes> | ReactArea2D<ScriptSchemes> | MinimapExtra
