/**
 * 协议生成会话 —— 跨组件 ephemeral store（仿 src/features/script-editor/store.ts）。
 *
 * 只持有跨 ProtocolGenWizard 子组件需要读写的轻量状态，不持有 transcript
 * （transcript 在 useProtocolGenSession 的 React state 里，通过 props 下发）。
 *
 * 模式与 store.ts 完全一致：create<T>((set) => ({ ...fields, ...setters }))
 */
import { create } from 'zustand'

export interface ProtocolGenEphemeralState {
  /** 当前活动分支 id（驱动分叉树侧栏高亮）。 */
  activeBranchId: string | null
  /** 是否展开工具日志（折叠默认值）。 */
  toolLogExpanded: boolean
  /** 是否显示分叉树侧栏。 */
  branchTreeVisible: boolean
  /** 三档操作里「不再问」已确认的步骤（持久到会话结束）。 */
  dontAskSteps: string[]
  setActiveBranchId: (id: string | null) => void
  setToolLogExpanded: (expanded: boolean) => void
  setBranchTreeVisible: (visible: boolean) => void
  markDontAsk: (step: string) => void
  reset: () => void
}

const INITIAL = {
  activeBranchId: null as string | null,
  toolLogExpanded: false,
  branchTreeVisible: true,
  dontAskSteps: [] as string[]
}

export const useProtocolGenStore = create<ProtocolGenEphemeralState>((set) => ({
  ...INITIAL,
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
  setToolLogExpanded: (toolLogExpanded) => set({ toolLogExpanded }),
  setBranchTreeVisible: (branchTreeVisible) => set({ branchTreeVisible }),
  markDontAsk: (step) =>
    set((state) =>
      state.dontAskSteps.includes(step)
        ? state
        : { dontAskSteps: [...state.dontAskSteps, step] }
    ),
  reset: () => set(INITIAL)
}))
