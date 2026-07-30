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
  updateGraphNodePosition,
  updateGraphNodePositions
} from '@/features/script-editor/rete/graphState'
import { ARRANGE_LAYOUT_OPTIONS } from '@/features/script-editor/rete/connectionPath'
import { createReteEditor, syncReteEditorFromGraph, syncReteNodeDataFromGraph, syncReteNodePositionsFromGraph } from '@/features/script-editor/rete/setup'
import type { ReteEditorInstance } from '@/features/script-editor/rete/setup'
import { classifyGraphSync } from '@/features/script-editor/rete/graphSync'
import {
  clampCanvasZoom,
  computeCanvasZoomMin,
  fitGraphToView,
  getNextCanvasNodePosition
} from '@/features/script-editor/viewModel'
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
  graphRevision: number
}

export interface GraphCanvasHandle {
  /** 让整张图居中并 fit 到可视区域，返回算出的 zoom。 */
  fitView: () => void
  /** 用 ELK 自动排版全部节点，写回坐标后 fit 到可视区域。 */
  arrangeLayout: () => Promise<void>
  /**
   * 当前图内容允许的最小 zoom（大图会低于默认 50%）。
   * 工具栏 +/- 缩放用此值 clamp，与画布滚轮/restrictor 一致。
   */
  getZoomMin: () => number
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
  onZoomChange,
  graphRevision
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
  const lastSyncedGraphRef = useRef<GraphEditorState | null>(null)
  const queuedGraphRef = useRef<GraphEditorState | null>(null)
  const syncQueueRef = useRef(Promise.resolve())
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
  // 上次已应用到 Rete 的 zoom，避免拖节点触发 graph 重渲染时反复 area.zoom 打断拖拽。
  const lastAppliedZoomRef = useRef(zoom)
  // 标记 fitView 被请求时 Rete 正在同步新 graph，需等同步完成后再 fit。
  const pendingFitRef = useRef(false)
  const arrangingRef = useRef(false)
  const onZoomChangeRef = useRef(onZoomChange)
  const lastGraphRevisionRef = useRef(graphRevision)

  // 主动把画布 transform 设置为算出的 fit 值（来自 fitGraphToView），并标记避免回调回灌。
  const applyFitTransform = (result: { zoom: number; x: number; y: number }) => {
    const instance = reteRef.current
    if (!instance) return
    applyingZoomRef.current = true
    lastAppliedZoomRef.current = result.zoom
    void instance.area.area.translate(result.x, result.y).then(() => {
      void instance.area.area.zoom(result.zoom).finally(() => {
        applyingZoomRef.current = false
        onZoomChangeRef.current(result.zoom)
      })
    })
  }

  // 读取已渲染节点真实包围盒（无实例时退回 graph 坐标 + 默认尺寸）。
  const collectFitRects = () => {
    const instance = reteRef.current
    if (instance && instance.area.nodeViews.size > 0) {
      return [...instance.area.nodeViews].map(([, view]) => {
        const el = view.element
        return {
          x: view.position.x,
          y: view.position.y,
          width: el.offsetWidth || 216,
          height: el.offsetHeight || 120
        }
      })
    }
    return graphRef.current.nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: 216,
      height: 120
    }))
  }

  const resolveZoomMin = () => {
    const container = canvasRef.current
    const size = container
      ? { width: container.clientWidth, height: container.clientHeight }
      : { width: 800, height: 600 }
    return computeCanvasZoomMin(collectFitRects(), size)
  }

  // 计算所有已渲染节点的真实包围盒，返回 fit 结果或 null（无节点）。
  const computeFit = () => {
    const container = canvasRef.current
    if (!container) return null
    return fitGraphToView(collectFitRects(), {
      width: container.clientWidth,
      height: container.clientHeight
    })
  }

  // 执行 fit；若 Rete 正在/即将同步新 graph，则登记为待执行，由 sync effect 结束后触发。
  const runFit = () => {
    const instance = reteRef.current
    const syncing = syncingRef.current
    const pendingSync = instance
      ? classifyGraphSync(lastSyncedGraphRef.current, graphRef.current).kind !== 'none'
      : true
    if (syncing || pendingSync) {
      pendingFitRef.current = true
      return
    }
    const result = computeFit()
    if (result) applyFitTransform(result)
  }

  const runArrangeLayout = async () => {
    const instance = reteRef.current
    if (!instance || graphRef.current.nodes.length === 0) return
    if (arrangingRef.current || syncingRef.current) return

    arrangingRef.current = true
    try {
      await instance.arrange.layout({
        options: ARRANGE_LAYOUT_OPTIONS
      })

      const positions: Record<string, { x: number; y: number }> = {}
      for (const [id, view] of instance.area.nodeViews) {
        positions[id] = { x: view.position.x, y: view.position.y }
      }
      const nextGraph = updateGraphNodePositions(graphRef.current, positions)
      graphRef.current = nextGraph
      // position 不在 structure signature 里，不会触发全量 resync。
      onGraphChangeRef.current(nextGraph)
    } finally {
      arrangingRef.current = false
    }

    // 排版后整图居中适配视口。
    runFit()
  }

  useImperativeHandle(ref, () => ({
    fitView: runFit,
    arrangeLayout: runArrangeLayout,
    getZoomMin: resolveZoomMin
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
          const plan = classifyGraphSync(lastSyncedGraphRef.current, nextGraph)
          if (plan.kind === 'node-data') {
            // 普通 Rete 内嵌控件已直接更新当前节点，无需再经 React 回灌一次。
            lastSyncedGraphRef.current = nextGraph
            queuedGraphRef.current = nextGraph
          }
          onGraphChangeRef.current(nextGraph)
        }
      }
    })
    reteRef.current = instance
    setEditorInstance(instance)
    instance.setAreaPanEnabled(capabilitiesRef.current.areaPan)
    // 画布组件卸载重建（对话框关闭重开 / dock 来回）时，createReteEditor 新建的 area
    // transform 是默认值（zoom=1），而父组件保留的 zoom 可能是非 1 值。若不在此主动对齐，
    // 后续两个 zoom effect 的守卫（lastAppliedZoomRef.current === zoom）会判定相等而跳过，
    // 导致 React zoom 与画板实际 transform 脱节，缩略图/拖动缩放全部失效。
    if (zoom !== 1) {
      applyingZoomRef.current = true
      lastAppliedZoomRef.current = zoom
      void instance.area.area.zoom(zoom).finally(() => {
        applyingZoomRef.current = false
      })
    }
    // 注意：本版本 Rete 的 addPipe 返回 void（无卸载句柄），pipe 清理依赖
    // instance.destroy()（销毁 area scope）及实例被 GC 回收。
    instance.area.addPipe((context) => {
        if (syncingRef.current) return context
        // 鼠标滚轮缩放由 Rete 内部处理，这里把它回灌到 React 的 zoom 状态，
        // 否则父组件持有的 zoom 与画板实际值脱节，后续任何 graph 变更（如添加节点）
        // 触发的 zoom(zoom) 会用过期值覆盖画板，造成“回滚”假象。
        if (context.type === 'zoomed' && !applyingZoomRef.current) {
          onZoomChangeRef.current(clampCanvasZoom(context.data.zoom, resolveZoomMin()))
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
          // 自动排版期间由 arrangeLayout 批量写回，跳过单点更新。
          if (arrangingRef.current) return context
          // 立即更新 graphRef，避免连续拖拽事件之间 React 尚未重渲染导致坐标回退。
          const nextGraph = updateGraphNodePosition(graphRef.current, context.data.id, context.data.position)
          graphRef.current = nextGraph
          // 拖动由 Rete 自身完成定位；记录为已同步，避免 React 回灌重复 translate。
          lastSyncedGraphRef.current = nextGraph
          queuedGraphRef.current = nextGraph
          onGraphChangeRef.current(nextGraph)
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

  // 图同步分级：普通参数只刷新该节点；拓扑变化（节点/端口/连线）才重建 Rete。
  // 队列必须串行，避免快速输入时 clear/addNode/addConnection 交错。
  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return

    const revisionChanged = lastGraphRevisionRef.current !== graphRevision
    const plan = revisionChanged
      ? { kind: 'structure' as const, changedNodeIds: [] }
      : classifyGraphSync(queuedGraphRef.current, graph)
    if (plan.kind === 'none') return

    queuedGraphRef.current = graph
    lastGraphRevisionRef.current = graphRevision
    syncingRef.current = true

    const task = syncQueueRef.current.then(async () => {
      if (plan.kind === 'node-data') {
        await syncReteNodeDataFromGraph(instance, graph, plan.changedNodeIds)
      } else if (plan.kind === 'node-position') {
        await syncReteNodePositionsFromGraph(instance, graph, plan.changedNodeIds)
      } else {
        await syncReteEditorFromGraph(instance, graph)
        if (lastAppliedZoomRef.current !== zoom) {
          lastAppliedZoomRef.current = zoom
          applyingZoomRef.current = true
          await instance.area.area.zoom(zoom)
          applyingZoomRef.current = false
        }
      }
      lastSyncedGraphRef.current = graph
    })
    const queueTail = task.catch((error) => {
      queuedGraphRef.current = null
      lastSyncedGraphRef.current = null
      console.error('同步脚本画布失败', error)
    })
    syncQueueRef.current = queueTail

    void task.finally(() => {
      if (syncQueueRef.current !== queueTail) return
      syncingRef.current = false
      if (pendingFitRef.current) {
        pendingFitRef.current = false
        const result = computeFit()
        if (result) applyFitTransform(result)
      }
    })
  }, [graph, graphRevision, zoom])

  // zoom 独立应用：只在 zoom 真的变化时调用 area.zoom
  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return
    if (lastAppliedZoomRef.current === zoom) return
    if (syncingRef.current) return // 全量同步期间由上面的 effect 负责对齐
    lastAppliedZoomRef.current = zoom
    applyingZoomRef.current = true
    void instance.area.area.zoom(zoom).finally(() => {
      applyingZoomRef.current = false
    })
  }, [zoom])

  // 空画布时让 minimap 仍可拖动平移、点击定位、滚轮缩放
  // （Rete MinimapPlugin 无节点时不渲染导航框 → 点/拖/滚轮默认无反应）
  useEmptyMinimapInteraction(
    canvasRef,
    editorInstance,
    graph.nodes.length === 0,
    (deltaY) => onZoomChange(computeWheelZoom(zoom, deltaY, resolveZoomMin()))
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
      onDragStart={(event) => {
        // 画布内部只允许 Rete 的 pointer 拖拽（平移/移节点）。
        // 若不拦截 HTML5 dragstart，Electron/Chromium 会生成半透明 ghost，
        // 并取消 pointer 序列，表现为「组件拖出影子 + 画布平移停住」。
        // 组件树 → 画布落点仍走 NodePalette 的 application/x-saecom-node D&D。
        event.preventDefault()
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
              <button
                className="script-editor-context-menu__item"
                role="menuitem"
                type="button"
                data-testid="auto-arrange-menu"
                onClick={() => {
                  setMenu(null)
                  void runArrangeLayout()
                }}
              >
                自动排版
              </button>
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
