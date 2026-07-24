# 串口助手 (SAEcom)

## 项目预览

可通过[部署页面](https://tylhk.github.io/SAEcom/)预览串口助手界面，仅做前端展示，不可连接真实串口使用。

## 项目特性概览

- 满足串口助手的基本功能
- 能够同时连接多个串口并将面板分离展示
- 面板可随意拖拽改变大小，且能够弹出作为独立窗口
- 用户可自定义js脚本控制串口数据发送

------

## 使用方法

- 下载[个人网站](https://filebox.satone1008.cn/)中对应的串口助手安装包（较快）
- 下载 [Releases](https://github.com/tylhk/SAEcom/releases) 文件并安装使用
- Fork[源码](https://github.com/tylhk/SAEcom)自行编译使用

------

## 从源码构建

适用于希望自行编译、二次开发或参与贡献的开发者。

### 环境要求

- **Node.js 20**（项目基于 Electron 31，内嵌 Node 20。推荐用 [nvm](https://github.com/nvm-sh/nvm)/[fnm](https://github.com/Schniz/fnm) 管理，仓库根目录已提供 `.nvmrc`，执行 `nvm use` 即可切换到正确版本）
- **npm**

### 关于原生模块：通常无需配置编译环境

本项目通过 [`serialport`](https://serialport.io/) 访问串口，其底层 [`@serialport/bindings-cpp`](https://www.npmjs.com/package/@serialport/bindings-cpp) 是原生模块。它基于 [N-API](https://nodejs.org/api/n-api.html)，**已为 Windows / macOS / Linux 各平台附带预编译二进制（prebuild）**，与 Electron 内嵌的 Node ABI 兼容。因此：

- **绝大多数情况下，`npm install` 后即可直接 `npm run dev`，无需安装任何 C++ 编译工具链或 Python。**
- `npm install` 的 `postinstall` 会尝试针对当前 Electron 重新编译原生模块（以求 ABI 精确匹配）。**即使这一步因缺少编译器而失败，也不影响使用**——会自动回退到自带的 prebuild 二进制。所以安装日志里看到 `node-gyp` 报错通常可以安全忽略。

#### 什么时候需要装编译工具链

仅当你遇到**与原生模块相关的运行时错误**（例如 `Could not locate the bindings file`、模块加载失败、或使用了 prebuild 未覆盖的架构）时，才需要补齐工具链并重新编译 `npm run rebuild`：

- **Windows**：[Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，安装时勾选 **“使用 C++ 的桌面开发”**（Desktop development with C++）工作负载（含 MSVC 与 Windows SDK）；并安装 [Python 3.x](https://www.python.org/downloads/)（安装时勾选 “Add python.exe to PATH”）。
- **macOS**：`xcode-select --install`（Command Line Tools，提供 clang）。Python 3 系统一般自带，或 `brew install python`。
- **Linux**：`sudo apt install python3 make g++`（Debian/Ubuntu）。

> 注：仅 `@serialport/bindings-cpp` 一个包涉及原生编译，其余依赖均为纯 JS 或已附带预编译二进制。

### 安装与运行

```bash
nvm use            # 切换到 .nvmrc 指定的 Node 20
npm install        # 安装依赖（原生模块会优先使用预编译二进制）
npm run dev        # 启动开发环境
```

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Electron + Vite 开发环境 |
| `npm run build` | 构建 main / preload / renderer 三端产物 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:e2e:build` | 构建并运行 Playwright E2E 测试 |
| `npm run rebuild` | 升级 Electron / Node 后重新编译原生模块 |
| `npm run dist:win` | 打包 Windows 安装包（NSIS） |
| `npm run dist:mac` | 打包 macOS 安装包（dmg） |

完整命令见 [`package.json`](./package.json) 的 `scripts` 与 [`AGENTS.md`](./AGENTS.md)。

------

## 功能展示

### 多面板串口管理

可以同时创建多个串口面板，方便开发者对比调试。面板支持拖拽、置顶、大小调整等操作。

<img src="https://satone1008.cn/wp-content/uploads/2025/09/1.gif" 
     style="width:100%; height:auto;" />

### 自定义命令与自动发送

支持保存常用命令，并在命令面板中快速调用。 自动发送功能带有动态效果，能清晰区分正在执行的指令。

<img src="https://satone1008.cn/wp-content/uploads/2025/09/2.gif" 
     style="width:100%; height:auto;" />

### 脚本功能

内置脚本运行环境，可以快速编写脚本实现自动化操作。 例如：定时生成随机字符串并通过串口发送。 脚本可一键运行 / 停止，方便测试和扩展。

<img src="https://satone1008.cn/wp-content/uploads/2025/09/3.gif" 
     style="width:100%; height:auto;" />

### 配置文件与状态保存

- 支持自动保存面板配置（波特率、校验位、命令列表等）
- 程序启动时会自动加载上一次的配置，避免重复设置

### 夜间模式与惊人的动画（可选项）

- 界面支持日/夜间模式切换
- 交互细节带有粒子特效、震动动画

<img src="https://satone1008.cn/wp-content/uploads/2025/09/4.gif" 
     style="width:100%; height:auto;" />

------

## 更新日志

### Ver.0.1.1

- 完成串口助手基本功能
- 添加用户可用的js脚本功能

### Ver.0.2.0

- 新的界面UI设计
- 新的设置页

### Ver.0.2.1
**FIX:**
- 菜单栏收起后的菜单区域无法按住拖拽窗口
- 命令过长时会挤压命令栏flex布局
- 会出现输入框无法点击的情况

**UPDATE:**
- 面板中过长数据会自动换行显示
- 查看面板旧数据时不会被接收到的新数据强行刷新页面
- 优化数据量大的情况下面板的操作与拖拽表现

### Ver.0.2.2
**FIX:**
- 接收高频数据时会出现非预期的换行
- 弹出的独立面板夜间模式下边框显示错误 且在弹出情况下切换夜间模式不会立即生效
- 弹出提示框后会出现输入框无法点击的情况

**UPDATE:**
- 主窗口大小改变时同步更新面板的位置与大小
- 重写了编辑命令页面中 添加了拖拽排序功能
- 优化数据量大的情况下面板的操作与拖拽表现

### Ver.0.3.0
**FIX:**
- 限制了窗口的最小尺寸
- 对面板的位置进行了限制 使其始终保持在主窗口内

**UPDATE:**
- 增加了TCP连接功能
- 增加了对长端口名的自动滚动显示

### Ver.0.3.1
**FIX:**
- 放宽了端口检测条件 防止某些端口无法被串口助手检测到

**UPDATE:**
- 淘汰了刷新串口按钮
  
### Ver.0.3.2
**UPDATE:**
- 现在可将本地串口分享为TCP Server并自动生成对应IP地址

### Ver.0.3.3
**FIX:**
- 修复了报错提示会重复显示的问题
- 修复了系统提示信息的错误行间距

**UPDATE:**
- 点击左侧端口名称可以隐藏/显示面板
- 可以通过拖拽对端口进行排序
- 可以在下侧菜单对面板名称进行备注

### Ver.0.3.4
**UPDATE:**
- 可以在命令页面使用滚轮进行翻页
- 可以通过拖拽对端口进行排序
- 可以在下侧菜单对面板名称进行备注

### Ver.0.3.5
**FIX:**
- 解决ICON显示不完整的问题

**UPDATE:**
- 为命令列表添加了分组功能
- 优化了编辑命令窗口的元素排列
- 将发送框并入面板

### Ver.0.4.0
**FIX:**
- 修复了弹出收回时串口面板内容出现的异常现象
- 修复命令组的默认分组异常现象
- 弹出的串口面板没有沿用备用名

**UPDATE:**
- 为弹出的串口面板添加了发送框
- 为命令列表添加了复制选中功能
- 添加了检查更新相关功能，现在可在程序内直接进行更新
- 鼠标悬浮在命令发送按钮上可显示命令的对应分组

### Ver.0.4.1
**FIX:**
- 修复了文本框内输入被异常覆盖的问题
- 修复了hex显示后数据之间换行丢失的问题
- 修复了弹出窗口的多个异常bug

**UPDATE:**
- 添加新菜单项-弹出窗口置顶
- 添加新菜单项-收回时跳转串口页
- 为弹出窗口添加了按钮 现在的操作逻辑与主面板的窗口一致

### Ver.0.4.2
**FIX:**
- 修复了命令编辑框大小不会自适应变化的问题
- 回显数据的格式将与正常数据保持一致

**UPDATE:**
- 软件更新将在后台静默进行并一键完成安装
- 在“关于”页面添加了“更新日志”按钮

### Ver.0.4.3
**FIX:**
- 修复了检查更新的前端UI显示问题
- 修复了主页面串口列表的拖拽动画
- 修复了命令列表的拖拽动画

**UPDATE:**
- 重新绘制了“关于”页面以及“更新日志”页面
- 增加了冬季特效与小游戏

**冬季特效:**
- 在设置中可开启冬季特效
- 欣赏落下的雪花
- 收起菜单向雪人发射雪球将他们冻结
- 当雪人靠近菜单时展开菜单，将他们全部击飞，其他的雪人会被吓得呆在原地

### Ver.0.4.4
**FIX:**
- 修复了面板切换时可能会导致波特率被复制覆盖的问题
- 修复了面板发送框无法单击以改变光标位置的问题
- 冬季特效关闭时将不会继续渲染雪球

**UPDATE:**
- 提高了菜单的稳定性
- 现在雪球也可以击飞雪人了

### Ver.0.4.5
**UPDATE:**
- 更新日志适配夜间模式
- 串口菜单边框与下方界面边框对齐
- 优化输入框的输入模式

### Ver.0.5.0
**UPDATE:**
- 添加了文件传输协议功能（暂时支持XModem/YModem）
- 添加了右键菜单功能
- 添加了简单的示波器功能

### Ver.0.5.1
**FIX:**
- 修复了TCP面板的文件协议传输问题

**UPDATE:**
- **重做命令页的脚本发送功能 改为模块化拖拽式脚本**
- 右键空白界面可新建串口面板/浏览器窗口
- 优化了设置页面的UI设计

### Ver.0.5.2
**FIX:**
- 第二次修复了串口面板的配置可能会被其他面板覆盖的问题
- 修复了串口菜单的显示优先级问题

### Ver.0.5.3
**UPDATE:**
- 增加了设置窗口最大保留数据条数功能。可以通过该功能自动丢弃面板中的旧数据，防止内存占用过大所导致的程序崩溃。
- 增加了实时录制串口数据功能。可以通过该功能自动将面板中的数据保存至本地TXT文件，并限制窗口最大保留数据条数以防程序崩溃，可用于无人监测情况下的长时间设备测试。

### Ver.0.5.4
**FIX:**
- 修复了实时录制功能中的时间戳显示问题

**UPDATE:**
- 优化了设置页面的UI设计

### Ver.0.6.0
**UPDATE:**
- 添加了关闭 发送/接收串口数据时间戳的设置
- 添加了部分二级确认菜单的开关设置
- 添加了选择面板内字符编码的设置
- 现在可以一键添加虚拟串口对以便进行调试

### Ver.0.6.1
**REVERT:**
- 虚拟串口功能在部分情况下表现不符预期，暂时取消，建议先使用虚拟串口软件[VSPD](https://filebox.satone1008.cn/) 

**UPDATE:**
- 优化了软件升级时的体验（于下次版本更新时生效）
- 优化部分描述性文本

------
## TODO

------

## 建议与反馈

如果您对功能或交互有更好的想法，欢迎提交 issue 或 PR。

博客与联系渠道：[支持多窗口监视的串口助手SAEcom – Satone](https://satone1008.cn/index.php/2025/09/16/支持多窗口监视的串口助手saecom/) 

项目仓库地址：[SAEcom: 基于Electron开发的多面板串口助手/Serial port Assistant based on Electron](https://github.com/tylhk/SAEcom)

