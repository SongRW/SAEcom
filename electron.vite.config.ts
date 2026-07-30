import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
        '@': resolve(__dirname, 'src')
      }
    },
    // 与常见前端项目默认 5173 错开；只绑 IPv4，避免 [::]:5173 抢占 localhost 的 IPv6 解析。
    server: {
      host: '127.0.0.1',
      port: 5273,
      strictPort: true
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          panel: resolve(__dirname, 'src/app/panel.html'),
          changelog: resolve(__dirname, 'src/app/changelog.html'),
          about: resolve(__dirname, 'src/app/about.html'),
          mainwindow: resolve(__dirname, 'src/app/mainwindow.html'),
          'script-editor': resolve(__dirname, 'src/app/script-editor.html'),
          'script-output': resolve(__dirname, 'src/app/script-output.html')
        }
      }
    }
  }
})
