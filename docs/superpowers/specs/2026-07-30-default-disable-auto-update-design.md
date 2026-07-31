# 默认关闭自动检查更新设计

- 日期：2026-07-30
- 分支：develop_srw
- 类型：配置兼容性调整与 Windows 安装包构建
- 影响文件：`src/shared/store/settings.ts`、`test/settings-store.test.ts`

## 背景

应用目前会在主窗口启动后根据 `appSettings.autoCheckUpdate` 自动检查更新。新安装用户的默认值是开启；旧版本地配置如果没有该字段，加载时也会被解析为开启。

本次将默认行为调整为关闭自动检查更新，避免启动时自动发起网络请求和显示更新提示。用户仍可从现有界面手动检查更新。

## 目标

1. 新安装用户默认不在启动时自动检查更新。
2. 已存在但缺少 `autoCheckUpdate` 字段的本地配置也默认关闭。
3. 已明确保存 `autoCheckUpdate: true` 的用户继续自动检查更新。
4. 手动“检查更新”入口、下载和安装流程保持不变。
5. 使用现有 `npm run dist:win` 产出 Windows NSIS 安装包。

## 设计

### 设置默认值与兼容解析

在 `src/shared/store/settings.ts` 中，将 `DEFAULTS.autoCheckUpdate` 改为 `false`。本地配置解析改为仅在值严格等于 `true` 时启用自动检查。

这会产生以下确定行为：

| 已存值 | 加载后的自动检查状态 |
| --- | --- |
| 字段不存在 | `false` |
| `false` | `false` |
| `true` | `true` |

存储的其它设置字段以及现有的 `setField`、`reset` 行为不变。

### 启动与手动更新流程

`MainWindow` 继续只在 `appSettings.autoCheckUpdate` 为真时触发启动检查。主进程更新 IPC、平台限制、下载和安装逻辑不变。设置页面中的开关仍允许用户主动开启自动检查；手动检查按钮不依赖该开关。

## 测试与验证

1. 更新 `test/settings-store.test.ts` 的默认值和 reset 断言为关闭。
2. 覆盖历史配置缺失字段时解析为关闭。
3. 覆盖显式保存 `true` 时仍启用自动检查。
4. 运行 `npm test` 和 `npm run typecheck`。
5. 运行 `npm run dist:win`，确认生成 Windows NSIS 安装包。

## 非目标

- 不移除手动检查更新功能。
- 不修改更新服务器、下载器、版本比较或安装器启动逻辑。
- 不修改 UI 布局和设置开关文案。
- 不强制关闭已有用户已保存的自动检查设置。
