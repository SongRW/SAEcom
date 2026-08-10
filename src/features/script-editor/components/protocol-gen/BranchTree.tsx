/**
 * 分叉树侧栏（pi agent 的 /tree 式可视化）。
 *
 * 列出所有分支，标记 verified，点击切换活动分支。
 * 主干 parentId=null 缩进 0，子分支缩进一级。
 */
import { Badge } from '@/components/ui/badge'
import { CheckCircle, GitBranch, Circle } from '@phosphor-icons/react'
import type { ProtocolGenBranch } from '@/features/script-editor/protocol-gen/protocolGenEngine'

interface BranchTreeProps {
  branches: ProtocolGenBranch[]
  activeBranchId: string | null
  onSelect: (branchId: string) => void
}

export function BranchTree({ branches, activeBranchId, onSelect }: BranchTreeProps) {
  if (branches.length === 0) {
    return (
      <div className="protocol-gen-wizard__branch-tree protocol-gen-wizard__branch-tree--empty">
        <GitBranch size={16} weight="bold" />
        <span>无分支</span>
      </div>
    )
  }
  return (
    <div className="protocol-gen-wizard__branch-tree" data-testid="branch-tree">
      <div className="protocol-gen-wizard__branch-tree-title">
        <GitBranch size={13} weight="bold" />
        <span>分支树</span>
      </div>
      {branches.map((branch) => {
        const isActive = branch.id === activeBranchId
        const isChild = branch.parentId !== null
        return (
          <button
            type="button"
            key={branch.id}
            className={`protocol-gen-wizard__branch-node ${isActive ? 'is-active' : ''} ${branch.verified ? 'is-verified' : ''}`}
            onClick={() => onSelect(branch.id)}
            style={{ paddingLeft: isChild ? 24 : 8 }}
            data-testid={`branch-node-${branch.id}`}
          >
            {branch.verified ? <CheckCircle size={12} weight="bold" /> : <Circle size={12} weight="regular" />}
            <span className="protocol-gen-wizard__branch-label">{branch.label}</span>
            <Badge variant={branch.verified ? 'default' : 'secondary'} className="protocol-gen-wizard__branch-badge">
              {branch.verified ? 'verified' : 'pending'}
            </Badge>
          </button>
        )
      })}
    </div>
  )
}
