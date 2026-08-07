import { app, BrowserWindow, shell, dialog, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import { spawn } from 'node:child_process'
import os from 'node:os'
import {
  modbusClients, ensureModbusOpen, closeModbus, applyPolls, setModbusBroadcaster,
} from './modbusService'
import { ConfigService } from './services/config.service'
import { AppService } from './services/app.service'
import { SerialService } from './services/serial.service'
import { TcpService } from './services/tcp.service'
import { ModbusService } from './services/modbus.service'
import { WindowService } from './services/window.service'
import { ScriptService } from './services/script.service'
import { ScriptsRepository } from './repositories/scripts.repository'
import { RuntimeContext } from './core/runtime-context'
import { registerConfigRouter } from './routers/config.router'
import { registerAppRouter } from './routers/app.router'
import { registerSerialRouter } from './routers/serial.router'
import { registerTcpRouter } from './routers/tcp.router'
import { registerModbusRouter } from './routers/modbus.router'
import { registerWindowRouter } from './routers/window.router'
import { registerScriptRouter } from './routers/script.router'
import { CustomComponentsRepository } from './repositories/custom-components.repository'
import { registerCustomComponentsRouter } from './routers/custom-components.router'

// iconv-lite 现由 core/buffer.ts 持有；此模块不再直接用 iconv（buildWriteBuffer 已抽离）。

// ========== E2E 测试钩子（仅当对应环境变量存在时生效，开发/打包零影响） ==========
// SAECOM_FORCE_PROD=1：直接跑 out/main/index.js 时 app.isPackaged 仍为 false，会误走 dev 分支连
//   127.0.0.1:5273（dev server 没起 → 白屏）。此开关强制按 prod 加载 out/renderer 产物。
// SAECOM_USER_DATA=<dir>：隔离持久化目录，避免测试污染本地 ~/Library/Application Support/SAEcom。
// SAECOM_E2E=1：关闭启动副作用（更新检查会弹模态 dialog 阻塞测试窗口）。
const FORCE_PROD = process.env.SAECOM_FORCE_PROD === '1'
const E2E_USER_DATA = process.env.SAECOM_USER_DATA || ''
const E2E_MODE = process.env.SAECOM_E2E === '1'
// E2E 时窗口不显示（show:false），避免测试期间窗口弹出抢焦点、挡屏幕。
// 渲染层照常工作，Playwright 仍可操作 DOM；显式 .show()（如 popout 恢复）不受影响。
const showWindow = !E2E_MODE
if (E2E_USER_DATA) {
  // app.setPath 必须在 app ready 前、且在 configPath/commandsPath/scriptsDir 读取 userData 前调用。
  app.setPath('userData', E2E_USER_DATA)
}

// electron-vite dev/prod 模式判断
const isDev = !app.isPackaged && !FORCE_PROD
// electron-vite 会把实际 dev server 地址写入 ELECTRON_RENDERER_URL；
// 默认回退到本项目固定端口 5273（与常见前端 5173 错开，见 electron.vite.config.ts）。
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5273'
// preload 编译输出到 out/preload/index.js（与 main 同级的 ../preload/）
const PRELOAD_PATH = path.join(__dirname, '../preload/index.js')
// 渲染进程产物：dev 模式由 dev server 提供，prod 模式在 out/renderer/src/
// （electron-vite renderer root='.', entry=src/app/mainwindow.html → 输出保留 src/ 前缀）
const RENDERER_DIST = path.join(__dirname, '../renderer/src')

// 把 BrowserWindow 广播能力注入 modbus 服务
setModbusBroadcaster((channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
})

// ========== 三层架构：装配（组1-4） ==========
// Service 内部状态私有化；依赖经构造注入。Router 不持状态，仅注册到 ipcMain。
// 已迁移域：config / app / serial / tcp / modbus / window / script。
// 串口/TCP 收到数据时经 dataBroadcaster 通知脚本监听器（ScriptService.notifyScriptWatchers）——
// 组4 后脚本沙箱数据通路由 ScriptService 自管。
//
// 所有 service / repository 装配后登记进 RuntimeContext（DI 容器），由 ctx 统一持有。
// 构造顺序即依赖拓扑序（Config/App/Serial/Tcp/Modbus/Window 先于 Script）；跨服务回调注入
// （dataBroadcaster）带有业务语义，保持在此显式编排，不内化进 ctx。
const ctx = new RuntimeContext()
const appService = new AppService()
const configService = new ConfigService(app.getPath('userData'))
const serialService = new SerialService()
const tcpService = new TcpService()
const modbusService = new ModbusService()
const windowService = new WindowService({
  preloadPath: PRELOAD_PATH,
  devServerUrl: DEV_SERVER_URL,
  rendererDist: RENDERER_DIST,
  isDev,
  showWindow
})
const scriptsRepository = new ScriptsRepository()
const customComponentsRepository = new CustomComponentsRepository()
const scriptService = new ScriptService(serialService, tcpService, modbusService)
// 登记到 DI 容器（之后消费者从 ctx 取，不再走散落的全局变量）。
ctx.registerService('app', appService)
ctx.registerService('config', configService)
ctx.registerService('serial', serialService)
ctx.registerService('tcp', tcpService)
ctx.registerService('modbus', modbusService)
ctx.registerService('window', windowService)
ctx.registerService('script', scriptService)
ctx.registerRepository('scripts', scriptsRepository)
ctx.registerRepository('customComponents', customComponentsRepository)
// 脚本监听器广播：串口/TCP 数据到达 → ScriptService.notifyScriptWatchers
// （原 main.ts 顶层 notifyScriptWatchers 桥接，组4 后状态归 ScriptService 私有持有）。
serialService.setDataBroadcaster((portId, buf) => scriptService.notifyScriptWatchers(portId, buf))
tcpService.setDataBroadcaster((portId, buf) => scriptService.notifyScriptWatchers(portId, buf))

// (config helpers 抽至 ConfigService)

// ========== 窗口 ==========// ========== 窗口 ==========
// 窗口域状态（windowService.getMainWindow()/popoutWindows/scriptEditor*/scriptOutput*/currentDark）已迁移至 WindowService（组3）。

// openExternal / createMainWindow 已迁移至 WindowService（组3）。

// shares / isRfc1918// shares / isRfc1918 已迁移至 SerialService（组2）。

// looksVirtual / listLanIPv4 / TCP 客户端(sockets) / TCP 服务器(tcpServer*) / buildWriteBuffer /
// writeToSerial / ensureSerialOpen / startTcpShare / stopTcpShare / tcpShare:* / tcp:* / tcpServer:*
// 已迁移至 TcpService / SerialService（组2）。

// 脚本域（runningScripts/scriptWatchers/scriptTcpClients/sandboxTcpServers/ensureTcpServer/
// sandbox 对象字面量/scripts:run/stop/CRUD）已迁移至 ScriptService + CapabilityRegistry +
// providers(core/serial/tcp/modbus/codec) + ScriptsRepository + ScriptRouter（组4）。
// writeGeneric 移入 CoreCapabilityProvider；addScriptWatcher/removeScriptWatcher*/notifyScriptWatchers
// 移入 ScriptService；normalizeScriptListenOptions/normalizeAppendMode/trimScriptPacketEnding
// 移入 capabilities/script-listen-helpers；getPortId 用 serialService.getPortId。

// config:* / commands:* / commands:flush 已迁移至 ConfigService（组1）。
// quitFlushFinish 由 ConfigService 持有；before-quit 经 configService.setQuitFlushFinish。

// listSerialPortsSafe / serial:* / modbus:* 已迁移至 SerialService/ModbusService（组2）。

// file:* 已迁移至 ConfigService（组1）。
// window:* / theme:set / applyTitleBarOverlay / changelog:open / about:open 已迁移至 WindowService（组3）。
// panel:* (request-hide/saveLog/popout) + script-editor:popout/request-dock 已迁移至 WindowService（组3）。

// —— 脚本输出独立窗// —— 脚本输出独立窗（单例）——
// script-output:* + panel:set-always-on-top/request-dock 已迁移至 WindowService（组3）。
// scripts:dir/list/read/write/delete/rename/export/import + scripts:run + scripts:stop
// 已迁移至 ScriptRouter（组4）。
// logger:append / logger:pickFile 已迁移至 ConfigService（组1）。

/**
 * 安装 Content-Security-Policy/**
 * 安装 Content-Security-Policy（review 第 6 项）。
 * 通过 defaultSession 的 onHeadersReceived 给所有渲染层统一注入 CSP HTTP 头
 * （优先级高于 HTML <meta>，且一处维护 5 个窗口入口）。
 * - 生产（isDev=false）：严格收口。default-src 'self'，禁 inline/eval。
 *   渲染层由 loadFile 以 file: 协议加载，'self' 即覆盖 file: 资源。
 *   任何进入渲染层的不可信内容（串口/日志数据、图形 JSON、changelog HTML）均无法执行脚本。
 * - 开发：放宽以兼容 Vite——需 'unsafe-eval'（Vite 依赖）+ localhost dev server + ws HMR。
 *   切勿把开发态策略带进生产：开发态放宽仅因本地构建管线需要，不影响打包产物。
 *
 * 注意：不打 CDN 或远程 host 白名单，避免给未来 XSS 留逃逸口。
 */
function installCsp(): void {
  const prodPolicy = [
    "default-src 'self'",
    // 自定义 JS 组件的 emit 函数经 new Function 编译（组5-7）。需要 'unsafe-eval'。
    // 信任模型：自定义组件由本地用户编写（与脚本沙箱同等信任级）；emit 产出的 JS 进 vm 沙箱
    // 运行（白名单 API 兜底）。'unsafe-eval' 仅放行 new Function 编译用户 emit，不放宽其他。
    // 注：此前 prodPolicy 为严格 'self'，此处为自定义组件功能刻意放宽。
    "script-src 'self' 'unsafe-eval'",
    // Rete 画布（rete-react-plugin → styled-components）在运行时通过 <style> 标签动态注入
    // 大量节点 transform / 连线 / minimap 样式。这些样式内容在运行时生成、不可预测，
    // 无法用固定 nonce 白名单。必须放 unsafe-inline，否则 styled-components 注入被 CSP 拦截
    // 抛错，整个 Rete 渲染树（area 容器 / 连线 / minimap）崩溃。
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    // 串口/TCP 走 IPC 不走网络；connect-src 仅允许同源，挡住渲染层外联
    "connect-src 'self'",
    // Monaco ESM worker 由 Vite 输出为 renderer 同源静态资源，显式限制为同源。
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

  // 开发 CSP 与 DEV_SERVER_URL 同源；端口由 electron.vite.config.ts 固定为 5273。
  const devOrigin = DEV_SERVER_URL.replace(/\/$/, '')
  const devWsOrigin = devOrigin.replace(/^http/, 'ws')
  const devPolicy = [
    `default-src 'self' ${devOrigin}`,
    // Vite dev 三件套：eval（依赖按需 require）、unsafe-inline（@vitejs/plugin-react 的
    // Fast Refresh preamble 与 @vitejs/client 是内联脚本）、ws HMR。仅开发态，
    // 生产策略保持严格收口（见上方 prodPolicy），不放宽。
    `script-src 'self' ${devOrigin} 'unsafe-eval' 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${devOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${devWsOrigin} ${devOrigin}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

  const policy = isDev ? devPolicy : prodPolicy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

app.whenReady().then(() => {
  installCsp()
  scriptsRepository.ensureDir()
  scriptsRepository.seedBundledSampleScripts()
  customComponentsRepository.ensureDir()
  // 内置示例组件 seeding：shared/samples/components/*.json → userData/script-components/
  // （此前缺失，导致 custom-time-convert/geo-convert/aes-crypto 等示例组件在 UI 不可见）
  customComponentsRepository.seedBundledSampleComponents()
  // 三层架构：注册已迁移域的 router（组1-7：config/app/serial/tcp/modbus/window/script/customComponents）。
  // 从 RuntimeContext（DI 容器）取依赖——ctx 是 service/repository 的唯一访问入口。
  appService.setUpdateChecker((isManual) => checkForUpdates(isManual))
  registerConfigRouter(ctx.service('config'))
  registerAppRouter(ctx.service('app'))
  registerSerialRouter(ctx.service('serial'))
  registerTcpRouter(ctx.service('tcp'))
  registerModbusRouter(ctx.service('modbus'))
  registerWindowRouter(ctx.service('window'))
  registerScriptRouter(ctx.service('script'), ctx.repository('scripts'))
  registerCustomComponentsRouter(ctx.repository('customComponents'))
  windowService.createMainWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) windowService.createMainWindow() })
})

// window:set-oscilloscope-top 已迁移至 WindowService（组3）。

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ frameName, url }) => {
    if (frameName === 'SerialWave') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          frame: false,
          transparent: true,
          autoHideMenuBar: true,
          show: showWindow,
          backgroundColor: '#00000000',
          webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false
          }
        }
      }
    }
    // 外链（http/https/mailto）作为所有窗口的统一防线：系统浏览器打开 + deny（不内嵌打开）。
    // 此前非 SerialWave 分支恒 allow，外链防护全靠主窗逐窗口注册（且谁最后注册谁胜出，脆弱），
    // popout/示波器/脚本编辑器/about/changelog 等窗口完全无拦截。
    if (/^https?:/i.test(url) || /^mailto:/i.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
})
// 退出前栅栏：主动驱动渲染层 flush。
// before-quit preventDefault 会取消窗口关闭级联（beforeunload 因此不触发），
// 故不能靠渲染层被动 flush——必须主进程发 flush-requested，等渲染层
// flushNow 后回 commands:flush invoke 作为完成信号，再 app.exit。
// 用 quitting flag 让 1.5s 窗口内的第二次退出请求直接放行默认行为。
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (wins.length === 0) return // 无窗口，无可 flush，按默认行为退出
  quitting = true
  event.preventDefault()
  let done = false
  let timer: NodeJS.Timeout | null = null
  const finish = () => {
    if (done) return
    done = true
    configService.setQuitFlushFinish(null)
    if (timer) clearTimeout(timer)
    app.exit(0)
  }
  // 每个窗口 flushNow 后会 invoke('commands:flush')；任一窗口回复即视为可退
  // （命令 store 单例，任一窗口 flushNow 已代表全部待写命令落盘）。
  configService.setQuitFlushFinish(finish)
  for (const w of wins) {
    if (!w.isDestroyed()) w.webContents.send('app:flush-requested')
  }
  // 兜底：1.5s 内未收到 flush 回复（渲染层崩溃/卡死）则强退，避免卡死。
  timer = setTimeout(finish, 1500)
})
app.on('window-all-closed', () => {
  // 清理所有持有 win/sender 引用的资源，避免泄漏 + 向已销毁 webContents 发消息。
  // 各清理方式对齐对应的 IPC handler（tcp:close / tcpServer:stop / tcpShare:stop / scripts:stop）。
  // 串口/TCP/Modbus/共享 的清理经各 service（组2 状态私有化）。
  serialService.closeAllPorts()
  serialService.stopAllTcpShares()
  modbusService.closeAll()
  tcpService.closeAllSockets()
  tcpService.destroyAllServers()
  // 运行中脚本：取消 token（避免脚本结束时 sender.send 向死 webContents 发消息）。
  // 窗口全关 = 用户意图结束会话，中断后台脚本是预期行为（与 scripts:stop 一致）。
  scriptService.abortAllRunning()
  if (process.platform !== 'darwin') app.quit()
})

// 自动检查更新由 renderer 侧按设置(appSettings.autoCheckUpdate)触发，主进程仅响应 app:checkUpdate。
const UPDATE_URL = 'https://filebox.satone1008.cn/'
const FILE_PREFIX = '串串-'
const FILE_SUFFIX = '-win-x64.exe'

function versionCompare(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number)
  const p2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0
    const n2 = p2[i] || 0
    if (n1 > n2) return 1
    if (n1 < n2) return -1
  }
  return 0
}

function checkForUpdates(isManual = false): void {
  const mw = windowService.getMainWindow()
  // E2E 短路：测试模式下不弹任何更新 dialog，避免模态框阻塞测试窗口。
  if (E2E_MODE) return
  // 自动更新仅支持 Windows（FILE_SUFFIX=-win-x64.exe + runInstallerAndQuit 的 cmd/start）。
  // 非 Windows 短路：手动检查给明确提示，自动检查静默忽略，避免误判或执行跨平台命令。
  if (process.platform !== 'win32') {
    if (isManual && mw && !mw.isDestroyed()) dialog.showMessageBox(mw, { type: 'info', title: '检查更新', message: '当前平台暂不支持自动更新，请前往发布页手动下载。', buttons: ['确定'] })
    return
  }

  console.log('[Updater] Checking for updates...')

  const req = https.get(UPDATE_URL, (res) => {
    let data = ''
    res.on('data', (chunk) => data += chunk)
    res.on('end', () => {
      const verRegex = new RegExp(escapeRegExp(FILE_PREFIX) + '(\\d+\\.\\d+\\.\\d+)' + escapeRegExp(FILE_SUFFIX))
      const linkRegex = /href\s*=\s*["']([^"']+)["']/gi

      let match
      let latestVer = '0.0.0'
      let latestDownloadUrl = ''

      while ((match = linkRegex.exec(data)) !== null) {
        let href = match[1]
        href = href.replace(/&amp;/g, '&')
        let decodedHref = ''
        try { decodedHref = decodeURIComponent(href) } catch (e) { continue }

        const fileMatch = decodedHref.match(verRegex)
        if (fileMatch) {
          const foundVer = fileMatch[1]
          if (versionCompare(foundVer, latestVer) > 0) {
            latestVer = foundVer
            try { latestDownloadUrl = new URL(href, UPDATE_URL).href }
            catch (e) { console.error('[Updater] Invalid URL:', href) }
          }
        }
      }

      const currentVer = app.getVersion()
      console.log(`[Updater] Current: ${currentVer}, Remote Best: ${latestVer}`)

      if (latestVer === '0.0.0' || !latestDownloadUrl || versionCompare(latestVer, currentVer) <= 0) {
        if (isManual && mw && !mw.isDestroyed()) {
          dialog.showMessageBox(mw, { type: 'info', title: '检查更新', message: `当前版本 (${currentVer}) 已是最新。`, buttons: ['确定'] })
        }
        return
      }

      const saveName = `update-${latestVer}.exe`
      const savePath = path.join(os.tmpdir(), saveName)

      if (fs.existsSync(savePath)) {
        console.log('[Updater] File already exists, skipping download.')
        promptToInstall(latestVer, savePath)
      } else {
        const actionText = versionCompare(latestVer, currentVer) > 0 ? '升级' : '变更'
        // 窗口可能在异步检查期间被关闭；此时跳过弹窗（视为「稍后」）
        const msgPromise = (mw && !mw.isDestroyed())
          ? dialog.showMessageBox(mw, {
              type: 'info',
              title: '发现新版本',
              message: `检测到新版本 (${latestVer})。\n是否立即下载更新？`,
              buttons: [`下载${actionText}`, '稍后'],
              defaultId: 0,
              cancelId: 1
            })
          : Promise.resolve({ response: 1 } as Electron.MessageBoxReturnValue)
        msgPromise.then(({ response }) => {
          if (response === 0) {
            downloadUpdate(latestDownloadUrl, savePath, latestVer)
          }
        })
      }
    })
  })

  req.on('error', (e) => {
    console.error('[Updater] Check failed:', e.message)
    if (isManual) dialog.showErrorBox('检查失败', '无法连接到更新服务器：' + e.message)
  })
}

function downloadUpdate(fileUrl: string, savePath: string, version: string): void {
  const mw = windowService.getMainWindow()
  if (mw) mw.setProgressBar(0.1)

  const encodedUrl = new URL(fileUrl).href
  console.log(`[Updater] Downloading to: ${savePath}`)

  const file = fs.createWriteStream(savePath)

  const request = https.get(encodedUrl, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      file.close()
      fs.unlink(savePath, () => { })
      if (response.headers.location) {
        downloadUpdate(response.headers.location, savePath, version)
      } else {
        dialog.showErrorBox('更新失败', '服务器重定向错误。')
      }
      return
    }

    if (response.statusCode !== 200) {
      file.close()
      fs.unlink(savePath, () => { })
      dialog.showErrorBox('更新失败', `HTTP 状态码: ${response.statusCode}`)
      if (mw) mw.setProgressBar(-1)
      return
    }

    response.pipe(file)

    file.on('finish', () => {
      file.close(() => {
        if (mw) mw.setProgressBar(-1)
        promptToInstall(version, savePath)
      })
    })
  })

  request.on('error', (err) => {
    fs.unlink(savePath, () => { })
    if (mw) mw.setProgressBar(-1)
    dialog.showErrorBox('更新失败', '网络错误：' + err.message)
  })
}

function promptToInstall(version: string, filePath: string): void {
  const mw = windowService.getMainWindow()
  // 窗口可能在下载期间被关闭；此时视为「稍后安装」，避免向已销毁窗口弹窗
  const msgPromise = (mw && !mw.isDestroyed())
    ? dialog.showMessageBox(mw, {
        type: 'question',
        title: '准备安装',
        message: `新版本 ${version} 已准备就绪。\n\n点击【立即安装】将自动退出程序并开始更新。`,
        buttons: ['立即安装', '稍后安装'],
        defaultId: 0,
        cancelId: 1
      })
    : Promise.resolve({ response: 1 } as Electron.MessageBoxReturnValue)
  msgPromise.then(({ response }) => {
    if (response === 0) {
      runInstallerAndQuit(filePath)
    }
  })
}

function runInstallerAndQuit(filePath: string): void {
  console.log('[Updater] Spawning installer, deleting file on finish, and relaunching...')

  const targetAppPath = app.getPath('exe')
  const installCmd = `start /wait "" "${filePath}" /S`
  const deleteCmd = `del /f /q "${filePath}"`
  const relaunchCmd = `start "" "${targetAppPath}"`

  const fullCommand = `${installCmd} & ${deleteCmd} & ${relaunchCmd}`

  try {
    const subprocess = spawn('cmd', ['/c', fullCommand], {
      detached: true,
      windowsVerbatimArguments: true,
      stdio: 'ignore'
    })

    subprocess.unref()

    setTimeout(() => {
      app.quit()
    }, 500)

  } catch (e: any) {
    dialog.showErrorBox('安装启动失败', '无法启动安装程序：' + e.message)
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

