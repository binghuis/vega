import { cn } from '@/lib/utils'

interface Props {
  src: string
  alt: string
  /** contain(默认,完整展示+灰底留白)或 cover(裁切填充) */
  fit?: 'contain' | 'cover'
  /** 加在外层 <a> 上:尺寸/网格/shrink 等由调用方决定 */
  className?: string
}

// 统一缩略图外观:灰底 + 圆角 + 边框 + hover 高亮 + 懒加载 + 新窗打开原图。
// 尺寸不在此固定,由 className 透传,以兼容网格大图与行内小图。
export function Thumbnail({ src, alt, fit = 'contain', className }: Props) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'hover:border-ring bg-muted/30 block overflow-hidden rounded-md border',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn(
          'h-full w-full',
          fit === 'cover' ? 'object-cover' : 'object-contain',
        )}
      />
    </a>
  )
}
