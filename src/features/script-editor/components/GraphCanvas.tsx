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
  // 当前选中节点集的 ref 镜像：Rete 的 contextmenu pipe 回调在挂载时绑定一次，
  // 闭包里的 selectedNodeIds 会过期，需通过 ref 读取最新值（右键命中已选节点时
  // 保持多选不被重置）。
  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds)
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
  // 多节点群组拖动：被拖节点属于选中集时，其余选中节点由本逻辑主动 area.translate 跟随。
  // programmatic translate 不会回流到 nodetranslated pipe（与 arrangeLayout 一致），
  // 仍用此 guard 兜底防御任何潜在重入。
  const groupTranslatingRef = useRef(false)
  // 多选态下点击已选中节点：按下时保持多选（允许随后整组拖动），但若松手前没有发生
  // translate（纯点击），应在松手时切为单选该节点。这里记录「待单选候选」，
  // nodetranslated 一旦发生即清空（说明用户是在拖动而非纯点击）。
  const pendingSingleSelectRef = useRef<string | null>(null)
  const onZoomChangeRef = useRef(onZoomChange)
  const lastGraphRevisionRef = useRef(graphRevision)
  // 当前 Rete 实例是否已随 mount effect cleanup 而作废（dev StrictMode 双 mount 防残影）。
  const instanceCancelledRef = useRef(false)

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
    selectedNodeIdsRef.current = selectedNodeIds
  }, [selectedNodeIds])

  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return
    const selected = new Set(selectedNodeIds)
    for (const [id, view] of instance.area.nodeViews) {
      if (selected.has(id)) view.element.setAttribute('data-app-selected', 'true')
      else view.element.removeAttribute('data-app-selected')
    }

    // 连线高亮：为与选中节点相连的连线 SVG 设置 data-app-selected-endpoint / -direction。
    // 属性设在 [data-testid="connection"]（SVG）上而非 ConnectionView.element(holder div)，
    // 这样 CSS 选择器 [data-testid="connection"][data-app-selected-endpoint] 才能命中。
    // 零 React 重渲染：纯 DOM 属性操作，镜像上方 nodeViews 的 data-app-selected 模式。
    // 高亮是瞬态视觉，不写回 GraphEditorState（遵守 CONV-GRAPH-CANONICAL-STATE）。
    const connById = new Map(instance.editor.getConnections().map((conn) => [conn.id, conn]))
    for (const [connId, connView] of instance.area.connectionViews) {
      const conn = connById.get(connId)
      if (!conn) continue
      const svg = connView.element.querySelector('[data-testid="connection"]') as SVGElement | null
      if (!svg) continue
      const highlight = computeConnectionHighlight(
        { source: conn.source, target: conn.target },
        selected
      )
      if (highlight.endpoint) {
        svg.setAttribute('data-app-selected-endpoint', 'true')
        svg.setAttribute('data-app-selected-direction', highlight.direction as string)
      } else {
        svg.removeAttribute('data-app-selected-endpoint')
        svg.removeAttribute('data-app-selected-direction')
      }
    }
  }, [selectedNodeIds, graph])

  useEffect(() => {
    const container = canvasRef.current
    if (!container) return
    instanceCancelledRef.current = false
    // 清掉前一次 Rete 实例残留的 holder DOM。
    // Rete area.destroy() 在「实例已无 nodeViews 时销毁」（dev StrictMode 双 mount、
    // 或关闭重开时异步 sync 尚未把节点加成 view）不会移除任何 DOM，holder 留在容器里；
    // 下一轮 mount 又 append 新 holder → 多个 holder 并存，旧的形成残影。
    // 容器内只有两类子节点：React 管理的（script-editor-canvas__hud/__empty，由 JSX 渲染）
    // 和 Rete 注入的无类名 holder。这里只移除后者，不碰 React 管理的节点，避免 removeChild 冲突。
    for (const child of Array.from(container.children)) {
      if (!child.className.startsWith('script-editor-canvas__')) container.removeChild(child)
    }

    const instance = createReteEditor(container, {
      getArrangeOrderIndex: (id) => {
        const index = graphRef.current.nodes.findIndex((node) => node.id === id)
        if (index < 0) throw new Error(`未找到自动排版节点：${id}`)
        return index
      },
      getSelectedNodeIds: () => new Set(selectedNodeIdsRef.current),
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
          // 点击已在选中集中的节点时保持多选（不清空），这样随后拖动可整组移动；
          // 点击未选中节点才切为单选。与右键菜单的多选保持逻辑一致。
          // 多选态下点击已选中节点：记下「待单选候选」，若松手前未拖动则在 nodedragged
          // 时落为单选；nodetranslated 一旦发生即作废候选（说明是在拖动）。
          if (!selectedNodeIdsRef.current.includes(pickedId)) {
            onSelectNodesRef.current([pickedId])
            pendingSingleSelectRef.current = null
          } else if (selectedNodeIdsRef.current.length > 1) {
            pendingSingleSelectRef.current = pickedId
          }
          const now = Date.now()
          if (lastPickRef.current.id === pickedId && now - lastPickRef.current.time < 350) {
            lastPickRef.current = { id: '', time: 0 }
            pendingSingleSelectRef.current = null
            onNodeDoubleClickRef.current(pickedId)
          } else {
            lastPickRef.current = { id: pickedId, time: now }
          }
        }
        if (context.type === 'nodetranslated') {
          // 自动排版 / 群组拖动程序化 translate 期间跳过，避免回环。
          if (arrangingRef.current || groupTranslatingRef.current) return context
          // 发生实际拖动 → 作废「纯点击变单选」候选。
          pendingSingleSelectRef.current = null
          const draggedId = context.data.id
          const selected = selectedNodeIdsRef.current
          // 群组拖动：被拖节点在选中集且选中数>1 时，其余选中节点按相同位移一起移动。
          // 位移用事件携带的 position - previous 计算（世界坐标，与 zoom 无关）。
          if (selected.includes(draggedId) && selected.length > 1) {
            const delta = {
              x: context.data.position.x - context.data.previous.x,
              y: context.data.position.y - context.data.previous.y
            }
            // 被拖节点用事件新位置；其余选中节点在其当前 graph 坐标上叠加 delta。
            const positions: Record<string, { x: number; y: number }> = {
              [draggedId]: { x: context.data.position.x, y: context.data.position.y }
            }
            const curById = new Map(graphRef.current.nodes.map((n) => [n.id, n.position]))
            for (const id of selected) {
              if (id === draggedId) continue
              const cur = curById.get(id)
              if (!cur) continue
              positions[id] = { x: cur.x + delta.x, y: cur.y + delta.y }
            }
            const nextGraph = updateGraphNodePositions(graphRef.current, positions)
            graphRef.current = nextGraph
            lastSyncedGraphRef.current = nextGraph
            queuedGraphRef.current = nextGraph
            onGraphChangeRef.current(nextGraph)
            // 实时把其余选中节点的 Rete view 也 translate，否则只有数据更新、
            // 视觉上其它节点要等 React 重渲染才跟动（拖拽中明显卡顿）。
            // programmatic translate 理论上不回流此 pipe，guard 兜底防御重入。
            const instance = reteRef.current
            if (instance) {
              groupTranslatingRef.current = true
              const tasks: Promise<unknown>[] = []
              for (const id of selected) {
                if (id === draggedId) continue
                if (!positions[id]) continue
                tasks.push(instance.area.translate(id, positions[id]))
              }
              Promise.all(tasks).finally(() => { groupTranslatingRef.current = false })
            }
            return context
          }
          // 单节点拖动：立即更新 graphRef，避免连续拖拽事件之间 React 尚未重渲染导致坐标回退。
          const nextGraph = updateGraphNodePosition(graphRef.current, context.data.id, context.data.position)
          graphRef.current = nextGraph
          // 拖动由 Rete 自身完成定位；记录为已同步，避免 React 回灌重复 translate。
          lastSyncedGraphRef.current = nextGraph
          queuedGraphRef.current = nextGraph
          onGraphChangeRef.current(nextGraph)
        }
        if (context.type === 'nodedragged') {
          // 松手：若按下时记下了「纯点击变单选」候选、且拖动中未被作废（说明没有发生
          // translate），则落为单选该节点；与主流图形编辑器「多选态单击已选节点→变单选」一致。
          const pending = pendingSingleSelectRef.current
          pendingSingleSelectRef.current = null
          if (pending) onSelectNodesRef.current([pending])
        }
        if (context.type === 'contextmenu') {
          const menuEvent = context.data.event
          if (lastMenuEventRef.current !== menuEvent) {
            lastMenuEventRef.current = menuEvent
            menuEvent.preventDefault()
            const target = context.data.context
            const nodeId = target === 'root' || 'source' in target ? null : String(target.id)
            // 右键命中节点时：若该节点已在当前选中集中，保持多选（不重置为单选），
            // 这样多选后右键能对整个选中集操作；只有右键了未选中节点才切为单选。
            if (nodeId && !selectedNodeIdsRef.current.includes(nodeId)) {
              onSelectNodesRef.current([nodeId])
            }
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
      instanceCancelledRef.current = true
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
      // 实例已被 mount effect cleanup 作废（dev StrictMode 双 mount）：跳过同步，
      // 避免把节点加到已脱离管理的旧 area holder 上造成残影。
      if (instanceCancelledRef.current) return
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

  // 右键菜单删除目标：被右键节点在当前选中集中时，删除整个选中集（多选批量删除）；
  // 否则只删被右键节点本身。命中节点但未选中时，菜单触发处已把它设为单选，
  // 这里 selectedNodeIds 即为 [该节点]。
  const contextDeleteIds = menu?.nodeId && selectedNodeIds.includes(menu.nodeId)
    ? selectedNodeIds
    : (menu?.nodeId ? [menu.nodeId] : selectedNodeIds)
  const deleteNodes = (ids: string[]) => {
    let next = graphRef.current
    for (const id of ids) next = removeGraphNode(next, id)
    onGraphChange(next)
    onDeleteSelectedNodes()
  }

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
        // 屏幕点 → 世界点逆变换：world = (screen - canvasOrigin - transform) / zoom。
        // Rete 画布变换为 screen = world * zoom + transform，故必须减去 transform 平移量。
        // 复杂脚本 fit 到低于 50% 时 transform.x/y 很大（把大包围盒居中），
        // 旧实现只除 zoom 不减平移量 → 拖入落点严重偏移。
        const t = reteRef.current?.area.area.transform ?? { x: 0, y: 0, k: zoom }
        const k = t.k || zoom
        const worldX = (event.clientX - rect.left - t.x) / k
        const worldY = (event.clientY - rect.top - t.y) / k
        onDropNode(key, {
          x: Math.max(12, worldX),
          y: Math.max(12, worldY)
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
        <div
          className="script-editor-context-menu"
          ref={menuRef}
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          // 阻止菜单上的 pointerdown 冒泡到画布 <main>：在「选择」工具下画布会据此
          // 启动 marquee 并 setPointerCapture，从而吞掉菜单项的 click（点击删除无反应）。
          onPointerDown={(event) => event.stopPropagation()}
        >
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
                  const ids = [...contextDeleteIds]
                  setMenu(null)
                  deleteNodes(ids)
                }}
              >
                {contextDeleteIds.length > 1 ? `删除选中 ${contextDeleteIds.length} 个节点` : '删除节点'}
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
              {selectedNodeIds.length > 0 ? (
                <>
                  <div className="script-editor-context-menu__separator" />
                  <button
                    className="script-editor-context-menu__item is-danger"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      const ids = [...selectedNodeIds]
                      setMenu(null)
                      deleteNodes(ids)
                    }}
                  >
                    删除选中 {selectedNodeIds.length} 个节点
                    <span>Del</span>
                  </button>
                </>
              ) : null}
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

export type ConnectionHighlightDirection = 'out' | 'in' | 'both' | null
export interface ConnectionHighlight {
  endpoint: boolean
  direction: ConnectionHighlightDirection
}

/**
 * 计算单条连线相对于当前选中节点集的高亮状态（纯函数，便于单测）。
 *
 * 语义：
 * - 出边（source 选中）→ direction='out'，动画 source→target（绿色，数据流出）。
 * - 入边（target 选中）→ direction='in'，动画 target→source（橙色，数据流入）。
 * - 两端同时选中 → direction='both'，确定性使用出边方向（不叠加两种动画）。
 * - 两端都未选中 → endpoint=false（不高亮）。
 *
 * 注意：连线 path 始终从 source（start）画到 target（end），方向仅控制动画流动方向。
 */
export function computeConnectionHighlight(
  conn: { source: string; target: string },
  selectedNodeIds: Set<string>
): ConnectionHighlight {
  const sourceSelected = selectedNodeIds.has(conn.source)
  const targetSelected = selectedNodeIds.has(conn.target)
  if (sourceSelected && targetSelected) return { endpoint: true, direction: 'both' }
  if (sourceSelected) return { endpoint: true, direction: 'out' }
  if (targetSelected) return { endpoint: true, direction: 'in' }
  return { endpoint: false, direction: null }
}

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
