import { registerRouter, type InvokeRoutes } from '../core/ipc'
import type { ScriptService } from '../services/script.service'
import type { ScriptsRepository } from '../repositories/scripts.repository'

/**
 * ScriptRouter —— 脚本域的 IPC 注册。
 *
 * 通道名零变化：
 *   scripts:dir / list / read / write / delete / rename / export / import（CRUD + 导入导出）
 *   scripts:run（执行，返回 runId；日志经 scripts:log、结束经 scripts:ended 回送 sender）
 *   scripts:stop（停止某次 run）
 *
 * 不持状态：CRUD 委派 ScriptsRepository；执行/停止委派 ScriptService。
 * scripts:run 经 e.sender（WebContents）回送 log/ended，与原 main.ts handler 一致。
 */
export function registerScriptRouter(service: ScriptService, repo: ScriptsRepository): void {
  const invoke: InvokeRoutes = {
    dir: () => repo.getDir(),
    list: () => repo.list(),
    read: (_e, n: string) => repo.read(n),
    write: (_e, { name, content }) => repo.write(name, content),
    delete: (_e, n: string) => repo.delete(n),
    rename: (_e, { oldName, newName }) => repo.rename(oldName, newName),
    export: (_e, name: string) => repo.exportScript(name),
    import: () => repo.importScript(),
    run: (e, { code, ctx }) => service.run(code, ctx, e.sender),
    stop: (_e, { runId }) => service.stop(runId)
  }

  registerRouter({ namespace: 'scripts', invoke })
}
