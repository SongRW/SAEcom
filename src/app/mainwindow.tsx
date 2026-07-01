import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/shared/i18n'
import '@/styles/globals.css'
import '@/features/script-editor/script-editor.css'
import MainWindow from '@/features/main-window/MainWindow'

// React 主窗口入口：加载 globals.css（shadcn token）+ script-editor.css（Rete 画布）+ React。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MainWindow />
  </React.StrictMode>
)
