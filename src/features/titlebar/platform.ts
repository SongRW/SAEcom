/**
 * 平台检测（渲染进程侧）。
 * - mac：复用既有 navigator.platform 模式（见 shortcuts.ts）
 * - win：navigator.userAgent 含 "Win"
 * - linux：兜底（排除 Android 后含 "Linux"，或无匹配时默认 linux）
 *
 * 注意：Android UA 含 "Linux"，需先排除。Electron 桌面端不会出现 Android，此处仅作健壮性处理。
 */
export type Platform = 'mac' | 'win' | 'linux'

function nav(): { platform: string; userAgent: string } {
  const n = (typeof navigator !== 'undefined' ? navigator : {}) as { platform?: string; userAgent?: string }
  return { platform: n.platform || '', userAgent: n.userAgent || '' }
}

export function detectPlatform(): Platform {
  const { platform, userAgent } = nav()
  if (/mac|iphone|ipad|ipod/i.test(platform)) return 'mac'
  if (/win/i.test(userAgent)) return 'win'
  if (/android/i.test(userAgent)) return 'linux' // Android 不归类为 win/mac
  if (/linux/i.test(userAgent)) return 'linux'
  return 'linux' // 兜底
}

export function isMac(): boolean {
  return detectPlatform() === 'mac'
}
