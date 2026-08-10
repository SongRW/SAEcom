import { registerRouter, type InvokeRoutes, type SendRoutes } from '../core/ipc'
import type { AgentService } from '../services/agent.service'

/**
 * AgentRouter —— 协议生成向导后端域（agent）的 IPC 注册。
 *
 * 通道：
 *   agent:parseDocument        （invoke）按扩展名提取文档文本（docx/xlsx/pdf/txt…）
 *   agent:writeKnowledge       （invoke）FEAT+GOLD 协议知识写入 docs/knowledge/（CLI 编排）
 *   agent:chat                 （invoke）OpenAI 兼容流式 chat（当前 provider）；delta 经 e.sender 推 agent:chunk
 *   agent:chatAbort            （send）中止指定 id 的 chat
 *   agent:getLlmSettings / saveLlmProvider / deleteLlmProvider / setCurrentLlmProvider
 *   agent:testLlmProvider      （invoke）显式 provider 最小 chat（设置页测试连接）
 *   agent:probeModels          （invoke）探查端点可用模型列表（GET /models，CC Switch 式）
 *   agent:importFromCcSwitch
 *
 * 不持状态：全部委派 AgentService（纯 Node 逻辑，可单测）。
 */
export function registerAgentRouter(service: AgentService): void {
  const invoke: InvokeRoutes = {
    parseDocument: (_e, filePath: string) => service.parseDocument(filePath),
    writeKnowledge: (_e, input) => service.writeProtocolKnowledge(input),
    chat: (e, req) => service.chat(req, e.sender),
    getLlmSettings: () => ({ ok: true, settings: service.getLlmSettings() }),
    saveLlmProvider: (_e, provider) => service.saveLlmProvider(provider),
    deleteLlmProvider: (_e, id: string) => service.deleteLlmProvider(id),
    setCurrentLlmProvider: (_e, id: string) => service.setCurrentLlmProvider(id),
    testLlmProvider: (_e, provider) => service.testLlmProvider(provider),
    probeModels: (_e, provider) => service.probeModels(provider),
    importFromCcSwitch: () => service.importFromCcSwitch()
  }
  const send: SendRoutes = {
    chatAbort: (_e, id: string) => service.abortChat(id)
  }

  registerRouter({ namespace: 'agent', invoke, send })
}
