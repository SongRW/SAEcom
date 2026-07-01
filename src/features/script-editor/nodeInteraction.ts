export const SCRIPT_NODE_OPEN_CONFIG_EVENT = 'saecom:script-node-open-config'

export interface ScriptNodeInteractionDebugEvent {
  stage: string
  payload: Record<string, unknown>
  timestamp: string
}

const debugEvents: ScriptNodeInteractionDebugEvent[] = []

export function debugScriptNodeInteraction(stage: string, payload: Record<string, unknown> = {}) {
  if (!isScriptNodeInteractionDebugEnabled()) return
  const entry = {
    stage,
    payload,
    timestamp: new Date().toISOString()
  }
  debugEvents.push(entry)
  if (debugEvents.length > 80) debugEvents.shift()
  console.info(`[script-editor:event] ${stage}`, payload)
}

export function describeInteractionTarget(target: EventTarget | null): Record<string, unknown> | null {
  if (!(target instanceof HTMLElement)) return null

  return {
    tag: target.tagName,
    className: String(target.className || ''),
    nodeId: target.getAttribute('data-node-id') || target.closest('[data-node-id]')?.getAttribute('data-node-id') || null,
    text: target.textContent?.trim().slice(0, 80) || ''
  }
}

export function describePointerInteractionEvent(
  event: { button?: number; clientX: number; clientY: number; detail?: number; target: EventTarget | null; type: string }
): Record<string, unknown> {
  const topElement = document.elementFromPoint(event.clientX, event.clientY)
  const targetNode = findClosestNodeElement(event.target)
  const topNode = findClosestNodeElement(topElement)

  return {
    type: event.type,
    detail: event.detail || 0,
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY,
    target: describeInteractionTarget(event.target),
    top: describeInteractionTarget(topElement),
    nodeId: targetNode?.dataset.nodeId || topNode?.dataset.nodeId || null
  }
}

export function getScriptNodeInteractionDebugEvents(): ScriptNodeInteractionDebugEvent[] {
  return [...debugEvents]
}

export function clearScriptNodeInteractionDebugEvents() {
  debugEvents.length = 0
}

export function installScriptNodeInteractionDebugBridge() {
  const debugWindow = window as Window & {
    clearSaecomScriptNodeInteractionEvents?: () => void
    getSaecomScriptNodeInteractionEvents?: () => ScriptNodeInteractionDebugEvent[]
  }
  debugWindow.getSaecomScriptNodeInteractionEvents = getScriptNodeInteractionDebugEvents
  debugWindow.clearSaecomScriptNodeInteractionEvents = clearScriptNodeInteractionDebugEvents
}

export function isScriptNodeInteractionDebugEnabled(): boolean {
  return window.location.href.includes('scriptDebug=1')
}

function findClosestNodeElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-node-id]')
}
