// Dev wrapper: clears ELECTRON_RUN_AS_NODE before launching electron-vite dev.
// Necessary because the environment has ELECTRON_RUN_AS_NODE=1 set globally,
// which forces electron into pure-Node mode (app/BrowserWindow undefined).
const { spawn } = require('child_process')
const path = require('path')

delete process.env.ELECTRON_RUN_AS_NODE

const isWin = process.platform === 'win32'
// Windows uses .cmd shims; macOS/Linux use extensionless shell shims.
const bin = path.join('node_modules', '.bin', 'electron-vite' + (isWin ? '.cmd' : ''))

const child = spawn(bin, ['dev'], {
  stdio: 'inherit',
  env: { ...process.env },
  // .cmd shims require a shell on Windows.
  shell: isWin
})

child.on('close', (code) => process.exit(code ?? 0))
