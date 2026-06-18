import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const TONE = {
  default: '',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const

interface Props {
  /** 标题左侧图标(size-4) */
  icon?: ReactNode
  title: ReactNode
  /** 标题着色:default / warning(假设) / destructive(待澄清) */
  tone?: keyof typeof TONE
  children: ReactNode
  className?: string
}

// 统一分区:标题(图标 + 文案,固定字号/字重)+ 内容。标题↔内容间距固定。
export function Section({
  icon,
  title,
  tone = 'default',
  children,
  className,
}: Props) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <h3
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          TONE[tone],
        )}
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}
