import { useEffect, useState } from 'react'
import { getIPC } from '@/shared/ipc'

/**
 * 当前窗口最大化态 hook。
 * 初始 query 一次 isMaximized，随后订阅 onMaximizeChange 跟随。
 * 在非 Electron 环境（web 预览 / 测试无 api）安全降级为 false。
 */
export function useWindowControls(): {
  isMaximized: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
} {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let api: ReturnType<typeof getIPC> | null = null
    try {
      api = getIPC()
    } catch {
      return // 无 api（web 预览/测试），保持默认 false
    }
    api.window.isMaximized().then(setIsMaximized).catch(() => {})
    const off = api.window.onMaximizeChange((max) => setIsMaximized(max))
    return off
  }, [])

  const run = (fn: (w: ReturnType<typeof getIPC>['window']) => void) => {
    try {
      fn(getIPC().window)
    } catch {
      /* 无 api 时忽略 */
    }
  }

  return {
    isMaximized,
    minimize: () => run((w) => w.minimize()),
    toggleMaximize: () => run((w) => w.toggleMaximize()),
    close: () => run((w) => w.close())
  }
}
