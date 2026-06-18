import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { SpecMarkdown } from '@/components/SpecMarkdown'
import { StateNotice } from '@/components/StateNotice'
import { StructuredView } from '@/components/StructuredView'
import { Thumbnail } from '@/components/Thumbnail'
import { cn } from '@/lib/utils'
import { api, type SpecManifest } from '@/lib/api'

interface Props {
  spec: SpecManifest
  /** 点准则溯源 → 通知外壳展开第三栏(传 docLines);null 收起 */
  onPeek: (lines: number[] | null) => void
}

type Tab = 'text' | 'images' | 'structured'

type DocState =
  | { status: 'loading' }
  | { status: 'loaded'; text: string }
  | { status: 'error'; message: string }

export function SpecView({ spec, onPeek }: Props) {
  const id = spec.source.documentId
  const [tab, setTab] = useState<Tab>('text')
  const [doc, setDoc] = useState<DocState>({ status: 'loading' })

  // 切换需求(id 变化)时渲染期重置:回到正文、收起溯源、正文回到加载态
  const [prevId, setPrevId] = useState(id)
  if (id !== prevId) {
    setPrevId(id)
    setTab('text')
    setDoc({ status: 'loading' })
    onPeek(null)
  }

  // 图片 token → 直链(供结构化视图显示缩略图)
  const assetByToken = new Map(spec.assets.map((a) => [a.fileToken, a.file]))
  const imageUrl = (token: string) => {
    const file = assetByToken.get(token)
    return file ? api.assetUrl(id, file) : null
  }

  useEffect(() => {
    let alive = true
    api
      .getMarkdown(id)
      .then((text) => alive && setDoc({ status: 'loaded', text }))
      .catch(
        (e: unknown) =>
          alive &&
          setDoc({
            status: 'error',
            message: e instanceof Error ? e.message : '加载失败',
          }),
      )
    return () => {
      alive = false
    }
  }, [id])

  function switchTab(next: Tab) {
    setTab(next)
    onPeek(null) // 切视图收起溯源
  }

  const pills = [
    spec.source.kind,
    `${spec.counts.blocks} blocks`,
    `${spec.counts.images} 图`,
    `${(spec.counts.bytes / 1024).toFixed(0)} KB`,
    new Date(spec.fetchedAt).toLocaleString(),
  ]

  return (
    <main className="flex min-h-0 min-w-0 flex-col">
      {/* 文档头 */}
      <div className="shrink-0 px-6 pt-[18px]">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-[18px] font-semibold tracking-tight">
            {spec.title}
          </h2>
          <a
            href={spec.source.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="在飞书打开"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {pills.map((p) => (
            <span
              key={p}
              className="text-muted-foreground bg-muted rounded-pill px-2 py-0.5 text-[11.5px] whitespace-nowrap"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* navrow:源 / 产物 */}
      <div className="border-hairline mt-3.5 flex shrink-0 flex-wrap items-center gap-3 border-b px-6 pb-3.5">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
          源
        </span>
        <div className="bg-muted inline-flex gap-0.5 rounded-[9px] p-[3px]">
          <Seg active={tab === 'text'} onClick={() => switchTab('text')}>
            正文
          </Seg>
          <Seg active={tab === 'images'} onClick={() => switchTab('images')}>
            图片 <span className="text-[11px] opacity-70">{spec.counts.images}</span>
          </Seg>
        </div>
        <span className="bg-border h-6 w-px" />
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
          产物
        </span>
        <div className="bg-muted inline-flex gap-0.5 rounded-[9px] p-[3px]">
          <Seg
            active={tab === 'structured'}
            onClick={() => switchTab('structured')}
          >
            结构化
          </Seg>
        </div>
      </div>

      {/* 内容(独立滚动) */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {tab === 'text' && (
          <div className="max-w-[720px]">
            {doc.status === 'loading' && (
              <StateNotice tone="loading">加载正文…</StateNotice>
            )}
            {doc.status === 'error' && (
              <StateNotice tone="error">{doc.message}</StateNotice>
            )}
            {doc.status === 'loaded' && (
              <SpecMarkdown markdown={doc.text} resolveImage={imageUrl} />
            )}
          </div>
        )}

        {tab === 'images' &&
          (spec.assets.length === 0 ? (
            <StateNotice>无图片</StateNotice>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3">
              {spec.assets.map((asset) => (
                <Thumbnail
                  key={asset.fileToken}
                  src={api.assetUrl(id, asset.file)}
                  alt={asset.fileToken}
                  className="h-[104px]"
                />
              ))}
            </div>
          ))}

        {tab === 'structured' && (
          <StructuredView specId={id} imageUrl={imageUrl} onPeek={onPeek} />
        )}
      </div>
    </main>
  )
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[7px] px-3 py-[5px] text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-brand/[0.13] text-brand font-semibold'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
