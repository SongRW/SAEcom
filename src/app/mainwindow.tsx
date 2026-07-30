import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/shared/i18n'
import '@/styles/globals.css'
import '@/features/script-editor/script-editor.css'
import MainWindow from '@/features/main-window/MainWindow'

// React 主窗口入口：加载 globals.css（shadcn token）+ script-editor.css（Rete 画布）+ React。
// 本文件由 Vite 打包为同源 JS，生产 CSP（script-src/style-src 'self'）允许执行。
// 故所有冷启动逻辑（主题防 FOUC + 启动加载框样式/行为）都集中在此，
// 不在 mainwindow.html 内放任何内联 <script>/<style>（内联会被 CSP 拦截）。

// ── 冷启动：主题与字号（防 FOUC）──
// 在 React 挂载前同步应用，避免深色模式先以浅色绘制再切深导致闪白。
// 单一真源：localStorage['appSettings']（与 settings store 一致）。
;(function applyBootTheme() {
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
})()

// ── 冷启动：注入启动加载框样式 ──
// 加载框 DOM 在 mainwindow.html 里（纯结构），样式由这里注入 <style>。
// 因本脚本是同源模块，注入的 <style> 不受 'self' CSP 限制（运行时 DOM 操作，非内联 HTML）。
const loaderStyle = document.createElement('style')
loaderStyle.textContent = `
  html,
  body {
    margin: 0;
    height: 100%;
    overflow: hidden;
  }
  #root {
    height: 100%;
  }
  #app-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    /* 配色跟随主题：与 win32 titleBarOverlay 一致，深浅均不突兀。
       主题 class 已由上方 applyBootTheme 应用到 <html>，故此处据此选色。 */
    background: #f5f7fa;
    color: #1f2937;
    font-family: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
    transition: opacity 0.45s ease;
  }
  html.dark #app-loader {
    background: #0D1218;
    color: #E6E9EF;
  }
  #app-loader.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
  .loader-logo {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }
  .loader-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    opacity: 0.55;
    animation: app-loader-spin 0.8s linear infinite;
  }
  .loader-text {
    font-size: 13px;
    opacity: 0.65;
    min-height: 18px;
    letter-spacing: 0.02em;
  }
  @keyframes app-loader-spin {
    to { transform: rotate(360deg); }
  }
`
document.head.appendChild(loaderStyle)

// ── 冷启动：加载框行为（文案轮播 + 幂等隐藏 + 超时兜底）──
;(function setupAppLoader() {
  const loader = document.getElementById('app-loader')
  if (!loader) return // 加载框 DOM 不存在（如被其他入口复用）则跳过

  // 文案轮播：依次呈现各子系统加载阶段，营造"正在加载 xxx"的进度感。
  const messages = [
    '正在加载界面…',
    '正在初始化串口引擎…',
    '正在连接控制面板…',
    '即将就绪…'
  ]
  let i = 0
  const textEl = document.getElementById('app-loader-text')
  const timer = window.setInterval(() => {
    if (!textEl) return
    i = (i + 1) % messages.length
    textEl.textContent = messages[i]
  }, 900)

  // 幂等隐藏：无论被谁调用（渲染层 hideAppLoader / 超时兜底）都只执行一次。
  let done = false
  const hide = () => {
    if (done) return
    done = true
    clearInterval(timer)
    loader.classList.add('is-hidden')
    // 淡出动画结束（450ms）后移除节点，避免残留覆盖层拦截点击
    window.setTimeout(() => {
      if (loader.parentNode) loader.parentNode.removeChild(loader)
    }, 500)
  }

  // 暴露隐藏接口供渲染层首帧后调用（见 MainWindow.tsx useEffect）。
  ;(window as any).__hideAppLoader = hide

  // 超时兜底：8s 内渲染层没主动隐藏（dev 首编慢 / React 挂载报错 等），
  // 强制淡出移除，绝不卡死成永久遮罩挡住主窗口。
  window.setTimeout(hide, 8000)
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MainWindow />
  </React.StrictMode>
)
