import { Badge } from '@/components/ui/badge'

// 内容状态 → 徽章观感+文案的单一出处。
// 全站状态色一律经此映射,不要在组件里硬编码 emerald/amber/red。
const STATUS = {
  confirmed: { variant: 'success', label: '确定' },
  assumed: { variant: 'warning', label: '假设' },
  clarification: { variant: 'destructive', label: '待澄清' },
} as const

export type StatusKind = keyof typeof STATUS

export function StatusBadge({
  status,
  className,
}: {
  status: StatusKind
  className?: string
}) {
  const { variant, label } = STATUS[status]
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
