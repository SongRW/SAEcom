import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  PuzzlePiece,
  ArrowsOutCardinal,
  ArrowRight
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getIPC } from '@/shared/ipc'
import { nodeRegistry } from '@/features/script-editor/nodes/definitions'
import {
  fetchCustomComponentList,
  type CustomComponentListItem
} from '@/features/script-editor/components/CustomComponentPanel'
import type { ScriptEditorSidePanel } from '@/features/script-editor/uiState'

/**
 * 脚本功能区主页（activeTab === 'script'）。
 *
 * 取代原先仅一个居中「打开脚本编辑器」按钮的空白入口：把脚本编辑器、
 * 脚本列表、自定义组件库统计整合成一个启动台 / 概览页，让主页的脚本
 * 功能区随编辑器能力增长（自定义组件、搜索等）真正可用。
 *
 * 数据通过 IPC 现取（scripts.list / customComponents.list）；不在主页内
 * 做脚本编辑，详情操作仍交给 ScriptEditorDialog（点击脚本/组件或主按钮
 * 均打开编辑器，由 BottomNav 统一控制 dialog open）。
 */
interface ScriptHubProps {
  /** 主操作：打开脚本编辑器；可指定要加载的脚本或首先展开的侧栏。 */
  onOpenEditor: (options?: { initialScriptName?: string; initialSidePanel?: ScriptEditorSidePanel }) => void
  /** 刷新触发器：编辑器关闭后自增，驱动重新拉取列表（脚本/组件增删后主页刷新）。 */
  refreshKey?: number
}

export function ScriptHub({ onOpenEditor, refreshKey = 0 }: ScriptHubProps) {
  const { t } = useTranslation()
  const ipc = getIPC()
  const [scripts, setScripts] = useState<string[]>([])
  const [components, setComponents] = useState<CustomComponentListItem[]>([])
  const [loading, setLoading] = useState(true)

  // 拉取脚本文件名 + 自定义组件列表（解析出 descriptor.name 用于展示，
  // 而非裸 .json 文件名——与 CustomComponentPanel 同路径 readListItem）。
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [scriptNames, componentItems] = await Promise.all([
          ipc.scripts.list().catch(() => [] as string[]),
          fetchCustomComponentList().catch(() => [] as CustomComponentListItem[])
        ])
        if (cancelled) return
        setScripts(scriptNames)
        setComponents(componentItems)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ipc, refreshKey])

  // 内置节点数 = registry 总数 - 用户组件数
  const userComponentKeys = nodeRegistry.all()
    .filter((c) => nodeRegistry.isUser(c.key))
    .map((c) => c.key)
  const builtInCount = nodeRegistry.all().length - userComponentKeys.length

  return (
    <div className="script-hub">
      {/*
        顶部工具条：脚本数量 / 节点组件（只读统计 chip）+ 打开脚本编辑器 / 创建自定义组件（按钮），
        四个排成一排；去掉副标题与底部 hint 说明，把纵向空间让给下方列表。
      */}
      <header className="script-hub__toolbar">
        <div className="script-hub__chip" title={t('mainWindow.scriptHub.scriptsCount')}>
          <FileText className="size-4 text-muted-foreground" />
          <span className="script-hub__chip-label">{t('mainWindow.scriptHub.scriptsCount')}</span>
          <span className="script-hub__chip-value">{loading ? '–' : scripts.length}</span>
        </div>
        <div className="script-hub__chip" title={t('mainWindow.scriptHub.componentsCount')}>
          <PuzzlePiece className="size-4 text-muted-foreground" />
          <span className="script-hub__chip-label">{t('mainWindow.scriptHub.componentsCount')}</span>
          <span className="script-hub__chip-value">
            {loading ? '–' : `${builtInCount} + ${components.length}`}
          </span>
        </div>
        <Button
          className="script-hub__toolbar-btn"
          onClick={() => onOpenEditor()}
        >
          <ArrowsOutCardinal className="size-4" />
          {t('mainWindow.bottomNav.openScriptEditor')}
        </Button>
        <Button
          variant="outline"
          className="script-hub__toolbar-btn"
          onClick={() => onOpenEditor({ initialSidePanel: 'custom' })}
        >
          <PuzzlePiece className="size-4" />
          {t('mainWindow.scriptHub.createComponent')}
        </Button>
      </header>

      {/* 双栏：脚本列表 + 组件库概览 */}
      <div className="script-hub__columns">
        <section className="script-hub__panel">
          <div className="script-hub__panel-header">
            <FileText className="size-4" />
            <span>{t('mainWindow.scriptHub.scriptsList')}</span>
            <Badge variant="secondary" className="ml-auto">{scripts.length}</Badge>
          </div>
          <ScrollArea className="script-hub__panel-body">
            {loading ? (
              <div className="script-hub__empty">{t('common.loading')}</div>
            ) : scripts.length === 0 ? (
              <div className="script-hub__empty">
                <FileText className="size-6 opacity-40" />
                <span>{t('mainWindow.scriptHub.noScripts')}</span>
              </div>
            ) : (
              <ul className="script-hub__list">
                {scripts.map((name) => (
                  <li key={name}>
                    <Button
                      variant="ghost"
                      className="script-hub__list-item"
                      onClick={() => onOpenEditor({ initialScriptName: name })}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground ml-auto" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </section>

        <section className="script-hub__panel">
          <div className="script-hub__panel-header">
            <PuzzlePiece className="size-4" />
            <span>{t('mainWindow.scriptHub.componentsLibrary')}</span>
            <Badge variant="secondary" className="ml-auto">
              {builtInCount} + {components.length}
            </Badge>
          </div>
          <ScrollArea className="script-hub__panel-body">
            {components.length === 0 ? (
              <div className="script-hub__empty">
                <FileText className="size-6 opacity-40" />
                <span>{t('mainWindow.scriptHub.noCustomComponents')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => onOpenEditor({ initialSidePanel: 'custom' })}
                >
                  <PuzzlePiece className="size-4" />
                  {t('mainWindow.scriptHub.createComponent')}
                </Button>
              </div>
            ) : (
              <ul className="script-hub__list">
                {components.map((item) => (
                  <li key={item.fileName}>
                    <Button
                      variant="ghost"
                      className="script-hub__list-item"
                      onClick={() => onOpenEditor({ initialSidePanel: 'custom' })}
                      title={item.description || item.key || item.fileName}
                    >
                      <PuzzlePiece className="size-4 shrink-0 text-muted-foreground" />
                      {/* 显示 descriptor.name（如「转时间」），而非 .json 文件名；
                          readListItem 已在解析失败时回退到文件名去后缀。 */}
                      <span className="truncate">{item.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </section>
      </div>

    </div>
  )
}
