import { registerRouter, type InvokeRoutes } from '../core/ipc'
import type { CustomComponentsRepository } from '../repositories/custom-components.repository'

/**
 * CustomComponentsRouter —— 自定义组件持久化的 IPC 注册。
 *
 * 通道名零变化（对齐 preload customComponents 命名空间）：
 * customComponents:list / read / write / delete / rename / export / import。
 *
 * 仓库无状态（纯文件 CRUD + dialog），router 直接调仓库，不经 service。
 * 描述符的业务校验（key/端口/sandboxApis/emit）在 renderer 加载到注册表前做（validateUserDescriptor）。
 */
export function registerCustomComponentsRouter(repo: CustomComponentsRepository): void {
  const invoke: InvokeRoutes = {
    list: () => repo.list(),
    read: (_e, name: string) => repo.read(name),
    write: (_e, { name, content }) => repo.write(name, content),
    delete: (_e, name: string) => repo.delete(name),
    // newKey 随重命名一并改写描述符内 key（防止 key 与文件名脱同步 → 保存回滚）
    rename: (_e, { oldName, newName, newKey }) => repo.rename(oldName, newName, newKey),
    export: (_e, name: string) => repo.exportComponent(name),
    import: () => repo.importComponents()
  }

  registerRouter({ namespace: 'customComponents', invoke })
}
