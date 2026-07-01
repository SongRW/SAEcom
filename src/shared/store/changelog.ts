import { create } from 'zustand'

/**
 * 更新日志「有新版本」高亮状态。
 *
 * 恢复 legacy renderer.js:4547-4558 的行为：启动时读 app 版本，与 localStorage.lastReadVersion
 * 比较，不等则视为「有未读更新内容」，给「打开更新日志」按钮 + 「关于」入口加高亮/角标；
 * 用户打开过更新日志后写回 lastReadVersion，高亮清除。
 *
 * 仍用 legacy 同名 key `lastReadVersion`（localStorage 直存，不经 appSettings），保证双轨切换不丢态。
 *
 * 注：legacy 还有一条 `onUpdateAvailable` → 「检查更新」按钮 shining 的链路，但当前 main.ts
 * 的 checkForUpdates 只弹原生对话框、未向渲染进程发送该事件（preload 也未暴露），
 * 属已废弃的死链路，此处不重建，仅恢复实际有效的版本对比分支。
 */
const LAST_READ_KEY = 'lastReadVersion'

interface ChangelogBadgeState {
  /** 当前应用版本（setAppVersion 写入，由 AboutSection 经 IPC 取得） */
  appVersion: string
  /** 已读到的版本（持久化） */
  lastReadVersion: string
  /** 是否有未读更新内容：appVersion 非空且 !== lastReadVersion */
  hasUnread: () => boolean
  /** 注入当前版本并重算未读态 */
  setAppVersion: (v: string) => void
  /** 标记当前版本为已读（打开更新日志后调用） */
  markRead: () => void
}

function readLastRead(): string {
  try {
    return localStorage.getItem(LAST_READ_KEY) || ''
  } catch {
    return ''
  }
}

function writeLastRead(v: string) {
  try {
    localStorage.setItem(LAST_READ_KEY, v)
  } catch {
    /* ignore */
  }
}

export const useChangelogBadgeStore = create<ChangelogBadgeState>((set, get) => ({
  appVersion: '',
  lastReadVersion: readLastRead(),
  hasUnread: () => {
    const { appVersion, lastReadVersion } = get()
    return !!appVersion && appVersion !== lastReadVersion
  },
  setAppVersion: (v) => set({ appVersion: v }),
  markRead: () => {
    const { appVersion } = get()
    writeLastRead(appVersion)
    set({ lastReadVersion: appVersion })
  }
}))
