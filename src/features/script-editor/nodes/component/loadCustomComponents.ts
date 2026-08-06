import { getIPC } from '@/shared/ipc'
import { nodeRegistry } from '@/features/script-editor/nodes/definitions'
import { UserNodeComponent } from '@/features/script-editor/nodes/component/userComponent'
import {
  CompositeNodeComponent,
  type CompositeComponentDescriptor
} from '@/features/script-editor/nodes/component/compositeComponent'
import {
  validateCompositeDescriptor,
  validateUserDescriptor
} from '@/features/script-editor/nodes/component/validate'

/**
 * 从磁盘加载所有自定义组件并重新注册到 nodeRegistry。
 *
 * 流程：
 * 1. `customComponents.list()` 拿到所有 `.json` 文件名。
 * 2. 逐个 `read()` + JSON.parse → UserComponentDescriptor。
 * 3. 用 validateUserDescriptor 校验（existingKeys=[]；冲突在 save 时校验）。
 * 4. 合法的构造 UserNodeComponent 并 push；非法的 console.warn 跳过（不污染注册表）。
 * 5. `nodeRegistry.reloadUser(components)` 整批替换。
 *
 * 在 CustomComponentPanel 挂载 + 任意 mutation 后调用。reloadUser 使调色板
 * （groupNodesForPalette → listAllNodeDefinitions）自动反映最新组件。
 *
 * 返回加载摘要（供 UI 展示，例如「加载了 5 个，跳过 2 个非法」）。
 */
export interface LoadCustomComponentsResult {
  /** 成功加载并注册的组件（JS + composite 混合）。 */
  loaded: Array<UserNodeComponent | CompositeNodeComponent>
  /** 被跳过的文件名（解析/校验失败）。 */
  skipped: Array<{ name: string; reason: string }>
}

export async function loadAndRegisterCustomComponents(): Promise<LoadCustomComponentsResult> {
  const ipc = getIPC()
  let names: string[] = []
  try {
    names = await ipc.customComponents.list()
  } catch (e) {
    console.warn('[custom-components] list() 失败', e)
    return { loaded: [], skipped: [] }
  }

  const loaded: Array<UserNodeComponent | CompositeNodeComponent> = []
  const skipped: Array<{ name: string; reason: string }> = []

  for (const name of names) {
    let raw: string
    try {
      raw = await ipc.customComponents.read(name)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.warn(`[custom-components] 读取失败 ${name}`, reason)
      skipped.push({ name, reason: `读取失败: ${reason}` })
      continue
    }

    let descriptor: unknown
    try {
      descriptor = JSON.parse(raw)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.warn(`[custom-components] JSON 解析失败 ${name}`, reason)
      skipped.push({ name, reason: `JSON 解析失败: ${reason}` })
      continue
    }

    // existingKeys=[] —— 冲突检测在保存时做；这里允许同名覆盖（最后加载的胜出）
    const isComposite = typeof descriptor === 'object' && descriptor !== null
      && 'subgraph' in (descriptor as Record<string, unknown>)

    if (isComposite) {
      const result = validateCompositeDescriptor(descriptor, [])
      if (!result.ok || !result.descriptor) {
        const reason = result.errors.map((err) => err.message).join('; ')
        console.warn(`[custom-components] 跳过非法组合组件 ${name}:`, result.errors)
        skipped.push({ name, reason: `校验失败: ${reason}` })
        continue
      }
      try {
        loaded.push(new CompositeNodeComponent(result.descriptor))
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        console.warn(`[custom-components] 组合组件构造失败 ${name}`, reason)
        skipped.push({ name, reason: `构造失败: ${reason}` })
      }
      continue
    }

    const result = validateUserDescriptor(descriptor, [])
    if (!result.ok || !result.descriptor) {
      const reason = result.errors.map((err) => err.message).join('; ')
      console.warn(`[custom-components] 跳过非法组件 ${name}:`, result.errors)
      skipped.push({ name, reason: `校验失败: ${reason}` })
      continue
    }

    try {
      loaded.push(new UserNodeComponent(result.descriptor))
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      console.warn(`[custom-components] 构造失败 ${name}`, reason)
      skipped.push({ name, reason: `构造失败: ${reason}` })
    }
  }

  nodeRegistry.reloadUser(loaded)
  return { loaded, skipped }
}
