import { useEffect, useState } from 'react'
import { ChevronRight, FileStack, Sparkles } from 'lucide-react'

import { FeishuConfig } from '@/components/FeishuConfig'
import { ParsePanel } from '@/components/ParsePanel'
import { SpecView } from '@/components/SpecView'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { api, type FeishuConfigState, type SpecManifest } from '@/lib/api'

// 顶部流程面包屑(文案与原副标题一致)
const FLOW = ['飞书需求文档', '解析正文与图片', '落盘(下一步:需求结构化)']

function App() {
  const [config, setConfig] = useState<FeishuConfigState | null>(null)
  const [specs, setSpecs] = useState<SpecManifest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    api
      .getFeishuConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
    api.listSpecs().then((list) => {
      setSpecs(list)
      setSelectedId((cur) => cur ?? list[0]?.source.documentId ?? null)
    })
  }, [])

  async function refreshSpecs(): Promise<void> {
    setSpecs(await api.listSpecs())
  }

  async function handleParsed(manifest: SpecManifest) {
    await refreshSpecs()
    setSelectedId(manifest.source.documentId)
  }

  const ready = config?.ready ?? false
  const selected =
    specs.find((s) => s.source.documentId === selectedId) ?? null

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col lg:h-screen">
      {/* 顶部品牌栏:固定不随面板滚动 */}
      <header className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-0 z-20 shrink-0 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <span
            aria-hidden
            className="text-brand text-lg leading-none drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]"
          >
            ✦
          </span>
          <h1 className="font-brand text-lg font-semibold tracking-tight">
            <span style={{ fontVariationSettings: "'opsz' 72, 'SOFT' 6, 'WONK' 1" }}>
              Vega ·
            </span>{' '}
            <span className="text-brand font-cjk">织女</span>
          </h1>
          <nav className="text-muted-foreground ml-auto hidden items-center gap-1.5 text-xs md:flex">
            {FLOW.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3 opacity-50" />}
                <span className="bg-muted/70 rounded-md px-2 py-1">{step}</span>
              </span>
            ))}
          </nav>
        </div>
      </header>

      {/* 主体:左侧边栏与右主区在 lg 下各自独立滚动;窄屏退化为整页滚动 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 overflow-y-auto lg:w-88">
          <div className="flex flex-col gap-5 p-4 lg:p-5">
            <FeishuConfig config={config} onSaved={setConfig} />
            <ParsePanel ready={ready} onParsed={handleParsed} />

            <section>
              <div className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-sm font-medium">
                <FileStack className="size-4" />
                已解析需求
                <Badge variant="secondary">{specs.length}</Badge>
              </div>
              {specs.length === 0 ? (
                <p className="text-muted-foreground px-1 text-sm">
                  还没有解析记录。
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {specs.map((s) => {
                    const active = s.source.documentId === selectedId
                    return (
                      <li key={s.source.documentId}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(s.source.documentId)}
                          className={cn(
                            'w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                            active ? 'bg-brand/10' : 'hover:bg-accent',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                active
                                  ? 'bg-brand'
                                  : 'bg-muted-foreground/30',
                              )}
                            />
                            <span className="truncate font-medium">
                              {s.title}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 pl-3.5 text-xs">
                            {s.counts.blocks} blocks · {s.counts.images} 图
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-4 lg:p-6">
            {selected ? (
              <SpecView spec={selected} />
            ) : (
              <div className="text-muted-foreground flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center text-sm">
                <Sparkles className="text-muted-foreground/60 size-6" />
                <p className="max-w-xs">
                  粘贴飞书链接开始解析,或从左侧选择一条已解析记录
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      <Toaster richColors position="top-center" />
    </div>
  )
}

export default App
