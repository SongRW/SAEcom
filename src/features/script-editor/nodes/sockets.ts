import type { SocketKind } from '@shared/types'

export interface SocketMeta {
  key: SocketKind
  label: string
  color: string
}

export const SOCKETS: Record<SocketKind, SocketMeta> = {
  dataSocket: { key: 'dataSocket', label: '数据', color: '#4f8cff' },
  boolSocket: { key: 'boolSocket', label: '布尔', color: '#16a34a' },
  flowSocket: { key: 'flowSocket', label: '流程', color: '#a855f7' },
  triggerSocket: { key: 'triggerSocket', label: '触发', color: '#f97316' }
}

export const canConnectSockets = (from: SocketKind, to: SocketKind): boolean => from === to
