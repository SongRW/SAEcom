export { dslToGraph } from './toGraph'
export { AdapterRegistry, type FieldAdapter, type NodeSpec, type NodeSpecWithOutput, type AdapterContext } from './adapters'
export { registerDefaultAdapters, createDefaultRegistry } from './saecomAdapters'
export type { ProtocolDsl, ProtocolField, ConstField, UintField, TextField, BitfieldField, LengthPrefixField, CrcField, CustomField, Transport, LoopConfig } from '@shared/protocol-dsl'
