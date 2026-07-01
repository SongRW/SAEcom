import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ToggleRowProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}

/** 单个开关行:Label + Switch 横向两端对齐(各分区复用)。 */
export function ToggleRow({ id, label, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
