import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { CanvasTool } from '@/features/script-editor/uiState'
import {
  debugScriptNodeInteraction,
  SCRIPT_NODE_OPEN_CONFIG_EVENT
} from '@/features/script-editor/nodeInteraction'
import { computeMarqueeRect, getToolCapabilities, nodesInMarquee, type Bounds, type Point, type ToolCapabilities } from '@/features/script-editor/canvasInteraction'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'
import {
  connectGraphNodes,
  removeGraphConnection,
  removeGraphNode,
  updateGraphNodeData,
  updateGraphNodePosition
} from '@/features/script-editor/rete/graphState'
import { createReteEditor, syncReteEditorFromGraph } from '@/features/script-editor/rete/setup'
import type { ReteEditorInstance } from '@/features/script-editor/rete/setup'
import { clampCanvasZoom, fitGraphToView, getNextCanvasNodePosition } from '@/features/script-editor/viewModel'
import { useEmptyMinimapInteraction, computeWheelZoom } from '@/features/script-editor/useEmptyMinimapInteraction'

interface GraphCanvasProps {
  graph: GraphEditorState
  selectedNodeIds: string[]
  tool: CanvasTool
  zoom: number
  minimapVisible: boolean
  onGraphChange: (graph: GraphEditorState) => void
  onDropNode: (key: string, position: { x: number; y: number } | ((graph: GraphEditorState) => { x: number; y: number })) => void
  onDeleteSelectedNodes: () => void
  onDuplicateNode: (id: string) => void
  onOpenNodes: () => void
  onResetView: () => void
  onNodeDoubleClick: (id: string) => void
  onSelectNodes: (ids: string[]) => void
  onZoomChange: (zoom: number) => void
}

export interface GraphCanvasHandle {
  /** 让整张图居中并 fit 到可视区域，返回算出的 zoom。 */
  fitView: () => void
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas({
  graph,
  selectedNodeIds,
  tool,
  zoom,
  minimapVisible,
  onGraphChange,
  onDropNode,
  onDeleteSelectedNodes,
  onDuplicateNode,
  onOpenNodes,
  onResetView,
  onNodeDoubleClick,
  onSelectNodes,
  onZoomChange
}, ref) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const reteRef = useRef<ReteEditorInstance | null>(null)
  // editor 创建后触发一次重渲，让 useEmptyMinimapInteraction 能拿到非空实例
  const [editorInstance, setEditorInstance] = useState<ReteEditorInstance | null>(null)
  const graphRef = useRef(graph)
  // 把回调存入 ref，使 Rete 初始化 effect 仅在挂载时运行一次（[]），
  // 避免回调身份变化导致整个 Rete 编辑器被销毁重建。
  const onGraphChangeRef = useRef(onGraphChange)
  const onSelectNodesRef = useRef(onSelectNodes)
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick)
  const lastSyncedSignatureRef = useRef('')
  const syncingRef = useRef(false)
  const capabilitiesRef = useRef<ToolCapabilities>(getToolCapabilities(tool))
  const lastPickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 })
  const lastMenuEventRef = useRef<MouseEvent | null>(null)
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const marqueeStartRef = useRef<Point | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // 标记当前 zoom 变更是由本组件的 zoom effect 主动触发，避免回调再把同一个值写回父组件。
  const applyingZoomRef = useRef(false)
  // 标记 fitView 被请求时 Rete 正在同步新 graph，需等同步完成后再 fit。
  const pendingFitRef = useRef(false)
  const onZoomChangeRef = useRef(onZoomChange)

  // 主动把画布 transform 设置为算出的 fit 值（来自 fitGraphToView），并标记避免回调回灌。
  const applyFitTransform = (result: { zoom: number; x: number; y: number }) => {
    const instance = reteRef.current
    if (!instance) return
    applyingZoomRef.current = true
    void instance.area.area.translate(result.x, result.y).then(() => {
      void instance.area.area.zoom(result.zoom).finally(() => {
        applyingZoomRef.current = false
        onZoomChangeRef.current(result.zoom)
      })
    })
  }

  // 计算所有已渲染节点的真实包围盒，返回 fit 结果或 null（无节点）。
  const computeFit = () => {
    const instance = reteRef.current
    const container = canvasRef.current
    if (!instance || !container) return null
    const rects = [...instance.area.nodeViews].map(([, view]) => {
      const el = view.element
      return {
        x: view.position.x,
        y: view.position.y,
        width: el.offsetWidth || 216,
        height: el.offsetHeight || 120
      }
    })
    return fitGraphToView(rects, {
      width: container.clientWidth,
      height: container.clientHeight
    })
  }

  // 执行 fit；若 Rete 正在/即将同步新 graph，则登记为待执行，由 sync effect 结束后触发。
  // 通过签名判断：当前 graph 尚未同步到 Rete 时（如刚 selectScript），延后到同步完成。
  const runFit = () => {
    const instance = reteRef.current
    const syncing = syncingRef.current
    const pendingSync = instance ? lastSyncedSignatureRef.current !== graphStructureSignature(graphRef.current) : true
    if (syncing || pendingSync) {
      pendingFitRef.current = true
      return
    }
    const result = computeFit()
    if (result) applyFitTransform(result)
  }

  useImperativeHandle(ref, () => ({
    fitView: runFit
  }), [])

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange
  }, [onZoomChange])

  useEffect(() => {
    onGraphChangeRef.current = onGraphChange
  }, [onGraphChange])

  useEffect(() => {
    onSelectNodesRef.current = onSelectNodes
  }, [onSelectNodes])

  useEffect(() => {
    capabilitiesRef.current = getToolCapabilities(tool)
    reteRef.current?.setAreaPanEnabled(capabilitiesRef.current.areaPan)
  }, [tool])

  useEffect(() => {
    onNodeDoubleClickRef.current = onNodeDoubleClick
  }, [onNodeDoubleClick])

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return
    const selected = new Set(selectedNodeIds)
    for (const [id, view] of instance.area.nodeViews) {
      if (selected.has(id)) view.element.setAttribute('data-app-selected', 'true')
      else view.element.removeAttribute('data-app-selected')
    }
  }, [selectedNodeIds, graph])

  useEffect(() => {
    const container = canvasRef.current
    if (!container) return

    const instance = createReteEditor(container, {
      onGraphChange: (change) => {
        if (syncingRef.current) return
        if (change.type === 'connection-created') {
          onGraphChangeRef.current(connectGraphNodes(graphRef.current, change.connection))
        }
        if (change.type === 'connection-removed') {
          onGraphChangeRef.current(removeGraphConnection(graphRef.current, change.connectionId))
        }
        if (change.type === 'node-data') {
          const nextGraph = updateGraphNodeData(graphRef.current, change.id, change.key, change.value)
          graphRef.current = nextGraph
          lastSyncedSignatureRef.current = graphStructureSignature(nextGraph)
          onGraphChangeRef.current(nextGraph)
        }
      }
    })
    reteRef.current = instance
    setEditorInstance(instance)
    instance.setAreaPanEnabled(capabilitiesRef.current.areaPan)
    // 注意：本版本 Rete 的 addPipe 返回 void（无卸载句柄），pipe 清理依赖
    // instance.destroy()（销毁 area scope）及实例被 GC 回收。
    instance.area.addPipe((context) => {
        if (syncingRef.current) return context
        // 鼠标滚轮缩放由 Rete 内部处理，这里把它回灌到 React 的 zoom 状态，
        // 否则父组件持有的 zoom 与画板实际值脱节，后续任何 graph 变更（如添加节点）
        // 触发的 zoom(zoom) 会用过期值覆盖画板，造成“回滚”假象。
        if (context.type === 'zoomed' && !applyingZoomRef.current) {
          onZoomChangeRef.current(clampCanvasZoom(context.data.zoom))
        }
        const capabilities = capabilitiesRef.current
        if (context.type === 'nodepicked') {
          debugScriptNodeInteraction('rete.nodepicked', {
            id: context.data.id,
            nodeInteractive: capabilities.nodeInteractive
          })
        }
        if (context.type === 'nodepicked' && !capabilities.nodeInteractive) {
          return undefined
        }
        if ((context.type === 'nodetranslate' || context.type === 'nodetranslated') && !capabilities.nodeDrag) {
          return undefined
        }
        if (context.type === 'nodepicked') {
          const pickedId = context.data.id
          onSelectNodesRef.current([pickedId])
          const now = Date.now()
          if (lastPickRef.current.id === pickedId && now - lastPickRef.current.time < 350) {
            lastPickRef.current = { id: '', time: 0 }
            onNodeDoubleClickRef.current(pickedId)
          } else {
            lastPickRef.current = { id: pickedId, time: now }
          }
        }
        if (context.type === 'nodetranslated') {
          onGraphChangeRef.current(updateGraphNodePosition(graphRef.current, context.data.id, context.data.position))
        }
        if (context.type === 'contextmenu') {
          const menuEvent = context.data.event
          if (lastMenuEventRef.current !== menuEvent) {
            lastMenuEventRef.current = menuEvent
            menuEvent.preventDefault()
            const target = context.data.context
            const nodeId = target === 'root' || 'source' in target ? null : String(target.id)
            if (nodeId) onSelectNodesRef.current([nodeId])
            setMenu({ x: menuEvent.clientX, y: menuEvent.clientY, nodeId })
          }
        }
        return context
      })
    instance.editor.addPipe((context) => {
      if (syncingRef.current) return context
      if (context.type === 'connectionremoved') {
        onGraphChangeRef.current(removeGraphConnection(graphRef.current, context.data.id))
      }
      return context
    })

    return () => {
      reteRef.current = null
      setEditorInstance(null)
      instance.destroy()
    }
  }, [])

  useEffect(() => {
    const container = canvasRef.current
    if (!container) return
    const openNodeConfigFromCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>
      const nodeId = customEvent.detail?.id || getNodeIdFromEventTarget(reteRef.current, event.target)
      if (!nodeId) return
      onNodeDoubleClickRef.current(nodeId)
    }
    container.addEventListener(SCRIPT_NODE_OPEN_CONFIG_EVENT, openNodeConfigFromCustomEvent)
    return () => container.removeEventListener(SCRIPT_NODE_OPEN_CONFIG_EVENT, openNodeConfigFromCustomEvent)
  }, [])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return
    const signature = graphStructureSignature(graph)
    if (lastSyncedSignatureRef.current === signature) {
      applyingZoomRef.current = true
      void instance.area.area.zoom(zoom).finally(() => {
        applyingZoomRef.current = false
      })
      return
    }
    lastSyncedSignatureRef.current = signature
    syncingRef.current = true
    void syncReteEditorFromGraph(instance, graph).then(() => {
      applyingZoomRef.current = true
      void instance.area.area.zoom(zoom).finally(() => {
        applyingZoomRef.current = false
      })
    }).finally(() => {
      syncingRef.current = false
      // 若 fitView 在同步进行中被调用，这里补执行一次。
      if (pendingFitRef.current) {
        pendingFitRef.current = false
        const result = computeFit()
        if (result) applyFitTransform(result)
      }
    })
  }, [graph, zoom])

  // 空画布时让 minimap 仍可拖动平移、点击定位、滚轮缩放
  // （Rete MinimapPlugin 无节点时不渲染导航框 → 点/拖/滚轮默认无反应）
  useEmptyMinimapInteraction(
    canvasRef,
    editorInstance,
    graph.nodes.length === 0,
    (deltaY) => onZoomChange(computeWheelZoom(zoom, deltaY))
  )

  return (
    <main
      className={`script-editor-canvas is-tool-${tool}`}
      data-minimap={minimapVisible ? 'on' : 'off'}
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.key !== 'Delete' && event.key !== 'Backspace') || selectedNodeIds.length === 0) return
        event.preventDefault()
        let next = graphRef.current
        for (const id of selectedNodeIds) next = removeGraphNode(next, id)
        onGraphChange(next)
        onDeleteSelectedNodes()
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-saecom-node')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData('application/x-saecom-node')
        if (!key) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        onDropNode(key, {
          x: Math.max(12, (event.clientX - rect.left - 100) / zoom),
          y: Math.max(12, (event.clientY - rect.top - 28) / zoom)
        })
      }}
      onPointerDown={(event) => {
        if (!capabilitiesRef.current.marquee || event.button !== 0) return
        if (getNodeIdFromEventTarget(reteRef.current, event.target)) return
        marqueeStartRef.current = { x: event.clientX, y: event.clientY }
        setMarquee({ left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY })
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = marqueeStartRef.current
        if (!start) return
        setMarquee(computeMarqueeRect(start, { x: event.clientX, y: event.clientY }))
      }}
      onPointerUp={() => {
        const rect = marquee
        marqueeStartRef.current = null
        setMarquee(null)
        if (!rect || !reteRef.current) return
        const nodeRects = [...reteRef.current.area.nodeViews].map(([id, view]) => {
          const r = view.element.getBoundingClientRect()
          return { id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
        })
        onSelectNodes(nodesInMarquee(nodeRects, rect))
      }}
    >
      <div className="script-editor-canvas__surface" ref={canvasRef}>
        <div className="script-editor-canvas__hud" aria-hidden="true">
          Rete · {Math.round(zoom * 100)}%
        </div>
        {graph.nodes.length === 0 ? (
          <div className="script-editor-canvas__empty">从左侧组件入口打开组件树，或右键画布添加节点</div>
        ) : null}
      </div>
      {marquee ? (
        <div className="script-editor-marquee" style={getMarqueeStyle(marquee, canvasRef.current)} />
      ) : null}
      {menu ? (
        <div className="script-editor-context-menu" ref={menuRef} role="menu" style={{ left: menu.x, top: menu.y }}>
          {menu.nodeId ? (
            <>
              <button
                className="script-editor-context-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  const id = menu.nodeId as string
                  setMenu(null)
                  onNodeDoubleClick(id)
                }}
              >
                配置节点
                <span>双击</span>
              </button>
              <button
                className="script-editor-context-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  const id = menu.nodeId as string
                  setMenu(null)
                  onDuplicateNode(id)
                }}
              >
                复制节点
              </button>
              <div className="script-editor-context-menu__separator" />
              <button
                className="script-editor-context-menu__item is-danger"
                role="menuitem"
                type="button"
                onClick={() => {
                  const id = menu.nodeId as string
                  setMenu(null)
                  onGraphChange(removeGraphNode(graphRef.current, id))
                  onDeleteSelectedNodes()
                }}
              >
                删除节点
                <span>Del</span>
              </button>
            </>
          ) : (
            <>
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onOpenNodes() }}>打开组件树</button>
              <div className="script-editor-context-menu__separator" />
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onDropNode('input-serial', getNextCanvasNodePosition) }}>添加接收串口</button>
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onDropNode('input-panel', getNextCanvasNodePosition) }}>添加接收面板</button>
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onDropNode('transform-hex', getNextCanvasNodePosition) }}>添加 HEX 转换</button>
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onDropNode('output-serial', getNextCanvasNodePosition) }}>添加发送串口</button>
              <div className="script-editor-context-menu__separator" />
              <button className="script-editor-context-menu__item" role="menuitem" type="button" onClick={() => { setMenu(null); onResetView() }}>重置视图</button>
            </>
          )}
        </div>
      ) : null}
    </main>
  )
})

function getNodeIdFromEventTarget(instance: ReteEditorInstance | null, target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null

  const nodeElement = target.closest<HTMLElement>('[data-node-id]')
  if (nodeElement?.dataset.nodeId) return nodeElement.dataset.nodeId

  if (!instance) return null

  for (const [id, view] of instance.area.nodeViews) {
    if (view.element.contains(target)) return id
  }

  return null
}

function graphStructureSignature(graph: GraphEditorState): string {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      key: node.key,
      label: node.label,
      data: node.data
    })),
    connections: graph.connections
  })
}

function getMarqueeStyle(marquee: Bounds, canvas: HTMLElement | null): { left: number; top: number; width: number; height: number } {
  const rect = canvas?.getBoundingClientRect()
  const offsetX = rect?.left ?? 0
  const offsetY = rect?.top ?? 0
  return {
    left: marquee.left - offsetX,
    top: marquee.top - offsetY,
    width: marquee.right - marquee.left,
    height: marquee.bottom - marquee.top
  }
}
