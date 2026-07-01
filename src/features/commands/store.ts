import { create } from 'zustand'
import { getIPC } from '@/shared/ipc'

/** 单条命令。镜像 legacy renderer.js makeCmdRow 的字段（id/name/data/mode/group） */
export interface Command {
  id: string
  name: string
  data: string
  mode: 'text' | 'hex'
  group: string
}

/** 分组元信息。镜像 legacy loadCmdGroupsMeta（renderer.js:1182-1204） */
export interface CmdGroupsMeta {
  groups: string[]
  active: string
  visible: string[]
}

/** localStorage key，与 legacy renderer.js:1180 保持一致（双轨共享） */
const CMD_GROUPS_KEY = 'cmdGroupsMeta'
const DEFAULT_GROUP = '默认分组'

function genId(): string {
  return 'cmd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function loadGroupsMeta(): CmdGroupsMeta {
  try {
    const raw = localStorage.getItem(CMD_GROUPS_KEY)
    if (!raw) return { groups: [DEFAULT_GROUP], active: DEFAULT_GROUP, visible: [DEFAULT_GROUP] }
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return { groups: [DEFAULT_GROUP], active: DEFAULT_GROUP, visible: [DEFAULT_GROUP] }
    const groups = Array.isArray(obj.groups) && obj.groups.length ? obj.groups : [DEFAULT_GROUP]
    const active = obj.active && groups.includes(obj.active) ? obj.active : groups[0]
    let visible = Array.isArray(obj.visible) ? obj.visible.filter((g: string) => groups.includes(g)) : []
    if (!visible.length) visible = [...groups]
    return { groups, active, visible }
  } catch {
    return { groups: [DEFAULT_GROUP], active: DEFAULT_GROUP, visible: [DEFAULT_GROUP] }
  }
}

function persistGroupsMeta(meta: CmdGroupsMeta) {
  try {
    localStorage.setItem(CMD_GROUPS_KEY, JSON.stringify(meta))
  } catch {
    /* ignore */
  }
}

interface CommandsState {
  commands: Command[]
  groupsMeta: CmdGroupsMeta
  /** 是否已完成初始加载 */
  loaded: boolean

  load: () => Promise<void>

  addCommand: (group?: string) => void
  updateCommand: (id: string, patch: Partial<Omit<Command, 'id'>>) => void
  removeCommand: (id: string) => void
  /** 批量删除：对齐 legacy cmdDeleteSel（renderer.js:4339）。ids 为命令 id 列表 */
  removeCommands: (ids: string[]) => void
  /**
   * 批量移动到目标分组：对齐 legacy cmdMoveSel（renderer.js:4352）。
   * 把 ids 对应命令的 group 改为 target（目标分组需已存在）。
   */
  moveCommandsToGroup: (ids: string[], target: string) => void
  /**
   * 批量复制到目标分组：对齐 legacy cmdCopySel（renderer.js:4398）。
   * 复制 ids 对应命令（新 id、group=target）追加到末尾。返回新建条数。
   */
  copyCommandsToGroup: (ids: string[], target: string) => number
  /** 拖拽重排：把 from 移到 to 位置（仅对当前可见命令集内重排） */
  moveCommand: (fromIndex: number, toIndex: number) => void

  addGroup: (name: string) => 'ok' | 'duplicate' | 'blank'
  renameGroup: (oldName: string, newName: string) => void
  removeGroup: (name: string) => void
  setActiveGroup: (name: string) => void
  toggleGroupVisible: (name: string) => void
  /** 立即落盘挂起的变更（防抖窗口外也安全调用），供退出前 flush 使用 */
  flushNow: () => void
}

/**
 * 命令 store。镜像 legacy state.commands + cmdGroupsMeta。
 * 持久化：commands → ipc.commands.save；分组元信息 → localStorage cmdGroupsMeta（与 legacy 一致）。
 * 任何变更后自动持久化（防抖，避免每次按键全量写盘）。
 */
export const useCommandsStore = create<CommandsState>((set, get) => {
  /** persist 防抖窗口（ms）。连续快速变更只触发一次落盘。 */
  const PERSIST_DEBOUNCE_MS = 400
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  /** 持久化 commands 到主进程 + 同步分组元信息到 localStorage（防抖） */
  function persist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      writeNow()
    }, PERSIST_DEBOUNCE_MS)
  }

  /** 立即落盘（不防抖）。退出前 flushNow 与防抖到期都会调用。 */
  function writeNow() {
    const { commands, groupsMeta } = get()
    // 过滤纯空行（name 与 data 均空）：内存中保留空行便于继续编辑，但不持久化垃圾行。
    const toSave = commands.filter((c) => (c.name && c.name.trim()) || (c.data && c.data.trim()))
    try {
      getIPC().commands.save(toSave)
      void getIPC().commands.flush() // 栅栏：主进程处理完此前所有 save 后才 resolve（退出前据此判断完成）
    } catch {
      /* web 预览无 ipc，忽略 */
    }
    persistGroupsMeta(groupsMeta)
  }

  /** 镜像 legacy syncCmdGroupsMetaWithCommands：根据 commands 修正分组元信息 */
  function syncGroupsMeta(commands: Command[], meta: CmdGroupsMeta): CmdGroupsMeta {
    const groups = [...meta.groups]
    const set_ = new Set(groups)
    if (groups.length === 0) {
      groups.push(DEFAULT_GROUP)
      set_.add(DEFAULT_GROUP)
    }
    for (const cmd of commands) {
      const g = cmd.group || groups[0]
      if (g && !set_.has(g)) {
        set_.add(g)
        groups.push(g)
      }
      if (!cmd.group) cmd.group = groups[0]
    }
    const active = meta.active && set_.has(meta.active) ? meta.active : groups[0]
    let visible = meta.visible.filter((g) => set_.has(g))
    if (!visible.length) visible = [...groups]
    return { groups, active, visible }
  }

  return {
    commands: [],
    groupsMeta: { groups: [DEFAULT_GROUP], active: DEFAULT_GROUP, visible: [DEFAULT_GROUP] },
    loaded: false,

    async load() {
      if (get().loaded) return
      let commands: Command[] = []
      try {
        const raw = (await getIPC().commands.load()) as Command[]
        if (Array.isArray(raw)) commands = raw
      } catch {
        /* web 预览无 ipc */
      }
      let meta = loadGroupsMeta()
      meta = syncGroupsMeta(commands, meta)
      set({ commands, groupsMeta: meta, loaded: true })
      persistGroupsMeta(meta)
    },

    addCommand(group) {
      const g = group || get().groupsMeta.active
      const cmd: Command = { id: genId(), name: '', data: '', mode: 'text', group: g }
      set((s) => ({ commands: [...s.commands, cmd] }))
      persist()
    },

    updateCommand(id, patch) {
      set((s) => ({
        commands: s.commands.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }))
      persist()
    },

    removeCommand(id) {
      set((s) => ({ commands: s.commands.filter((c) => c.id !== id) }))
      persist()
    },

    removeCommands(ids) {
      if (!ids.length) return
      const set_ = new Set(ids)
      set((s) => ({ commands: s.commands.filter((c) => !set_.has(c.id)) }))
      persist()
    },

    moveCommandsToGroup(ids, target) {
      if (!ids.length) return
      const set_ = new Set(ids)
      set((s) => {
        if (!s.groupsMeta.groups.includes(target)) return s
        return {
          commands: s.commands.map((c) => (set_.has(c.id) ? { ...c, group: target } : c))
        }
      })
      persist()
    },

    copyCommandsToGroup(ids, target) {
      if (!ids.length) return 0
      const set_ = new Set(ids)
      let created = 0
      set((s) => {
        if (!s.groupsMeta.groups.includes(target)) return s
        const copies: Command[] = []
        for (const c of s.commands) {
          if (set_.has(c.id)) {
            copies.push({ ...c, id: genId(), group: target })
          }
        }
        created = copies.length
        return { commands: [...s.commands, ...copies] }
      })
      persist()
      return created
    },

    moveCommand(fromIndex, toIndex) {
      const { commands, groupsMeta } = get()
      // 仅在可见命令集内重排：legacy getVisibleCommands
      const visSet = new Set(groupsMeta.visible)
      const visIndices: number[] = []
      commands.forEach((c, i) => {
        if (visSet.has(c.group || DEFAULT_GROUP)) visIndices.push(i)
      })
      if (fromIndex < 0 || fromIndex >= visIndices.length || toIndex < 0 || toIndex >= visIndices.length) return
      const fromReal = visIndices[fromIndex]
      const toReal = visIndices[toIndex]
      const next = [...commands]
      const [moved] = next.splice(fromReal, 1)
      next.splice(toReal, 0, moved)
      set({ commands: next })
      persist()
    },

    addGroup(name) {
      const n = (name || '').trim()
      if (!n) return 'blank'
      // 重复判断提到 set 外，便于返回明确状态给调用方做反馈
      if (get().groupsMeta.groups.includes(n)) return 'duplicate'
      set((s) => {
        const meta = { ...s.groupsMeta, groups: [...s.groupsMeta.groups, n], visible: [...s.groupsMeta.visible, n] }
        return { groupsMeta: meta }
      })
      persist()
      return 'ok'
    },

    renameGroup(oldName, newName) {
      const n = (newName || '').trim()
      if (!n) return
      set((s) => {
        if (s.groupsMeta.groups.includes(n)) return s
        const replace = (arr: string[]) => arr.map((g) => (g === oldName ? n : g))
        const meta: CmdGroupsMeta = {
          groups: replace(s.groupsMeta.groups),
          active: s.groupsMeta.active === oldName ? n : s.groupsMeta.active,
          visible: replace(s.groupsMeta.visible)
        }
        const commands = s.commands.map((c) => (c.group === oldName ? { ...c, group: n } : c))
        return { groupsMeta: meta, commands }
      })
      persist()
    },

    removeGroup(name) {
      set((s) => {
        if (s.groupsMeta.groups.length <= 1) return s // 至少保留一个分组
        // fallback = 删除 name 后剩余分组里的第一个（若无则用 DEFAULT_GROUP）
        const fallback = s.groupsMeta.groups.find((g) => g !== name) || DEFAULT_GROUP
        const meta: CmdGroupsMeta = {
          groups: s.groupsMeta.groups.filter((g) => g !== name),
          active: s.groupsMeta.active === name ? fallback : s.groupsMeta.active,
          visible: s.groupsMeta.visible.filter((g) => g !== name)
        }
        // 迁移而非删除：组内（含 group 字段为空落在该组的）命令归入 fallback 组
        const commands = s.commands.map((c) =>
          (c.group || DEFAULT_GROUP) === name ? { ...c, group: fallback } : c
        )
        return { groupsMeta: meta, commands }
      })
      persist()
    },

    setActiveGroup(name) {
      set((s) => ({ groupsMeta: { ...s.groupsMeta, active: name } }))
      persist()
    },

    toggleGroupVisible(name) {
      set((s) => {
        let visible = s.groupsMeta.visible.includes(name)
          ? s.groupsMeta.visible.filter((g) => g !== name)
          : [...s.groupsMeta.visible, name]
        if (!visible.length) visible = [...s.groupsMeta.groups]
        return { groupsMeta: { ...s.groupsMeta, visible } }
      })
      persist()
    },

    flushNow() {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      writeNow()
    }
  }
})
