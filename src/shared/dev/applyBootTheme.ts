/**
 * 冷启动主题防闪烁（FOUC）—— 独立窗口入口共享。
 *
 * 为什么在 tsx 模块级而非 html 内联 <script>：
 * 生产 CSP（installCsp，见 electron/main.ts）script-src 为 'self'，禁止内联脚本；
 * 本模块由 Vite 打包为同源 JS，CSP 允许执行。
 *
 * 用法：各窗口入口 tsx（script-editor/panel/script-output）顶部 import 本模块即可。
 * 单一真源：localStorage['appSettings']（与 settings store 一致）；所有窗口共用
 * 默认 session，localStorage 同源共享，能读到主窗写入的设置。
 */
export function applyBootTheme(): void {
  try {
    const raw = localStorage.getItem('appSettings')
    const s = raw ? JSON.parse(raw) : {}
    const el = document.documentElement
    if (s.dark) {
      el.classList.add('dark')
      el.classList.add('theme-dark')
    }
    const fs = Number(s.fontSize)
    if (fs > 0) el.style.setProperty('--font-size-base', fs + 'px')
  } catch {
    /* 容错：解析失败则用默认浅色 */
  }
}

applyBootTheme()
