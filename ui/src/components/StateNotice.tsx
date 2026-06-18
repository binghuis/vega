import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface Props {
  /** loading(spinner+灰)/ error(红)/ muted(灰,默认) */
  tone?: 'loading' | 'error' | 'muted'
  children: ReactNode
  className?: string
}

// 内联状态提示(加载/错误/空):统一字号、颜色与加载图标,替代各组件各写一份。
export function StateNotice({ tone = 'muted', children, className }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {tone === 'loading' && <Loader2 className="size-4 animate-spin" />}
      {children}
    </div>
  )
}
