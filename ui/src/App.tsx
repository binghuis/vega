import { useEffect, useState } from 'react'

import { FeishuConfig } from '@/components/FeishuConfig'
import { ParsePanel } from '@/components/ParsePanel'
import { SourcePeek } from '@/components/SourcePeek'
import { SpecView } from '@/components/SpecView'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { api, type FeishuConfigState, type SpecManifest } from '@/lib/api'

function App() {
  const [config, setConfig] = useState<FeishuConfigState | null>(null)
  const [specs, setSpecs] = useState<SpecManifest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 溯源 peek:展示当前需求正文的指定行号(null=收起,切到第三栏)
  const [peek, setPeek] = useState<number[] | null>(null)

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
    selectSpec(manifest.source.documentId)
  }

  function selectSpec(id: string) {
    setSelectedId(id)
    setPeek(null) // 切换需求时收起溯源
  }

  const ready = config?.ready ?? false
  const selected =
    specs.find((s) => s.source.documentId === selectedId) ?? null

  return (
    <div className="bg-background text-foreground flex h-screen flex-col overflow-hidden">
      {/* 顶栏:chrome 带 */}
      <header className="bg-faint flex h-[54px] shrink-0 items-center gap-3 border-b px-5">
          <span aria-hidden className="text-brand text-base leading-none">
            ✦
          </span>
          <span className="font-serif text-[17px] font-semibold tracking-tight whitespace-nowrap">
            Vega · <span className="text-brand font-cjk">织女</span>
          </span>
        </header>

        {/* shell:源(rail) | 工作区 | 溯源 peek(可选第三栏) */}
        <div
          className={cn(
            'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]',
            peek && 'lg:grid-cols-[300px_minmax(0,1fr)_340px]',
          )}
        >
          {/* 左栏 = 源 */}
          <aside className="flex flex-col gap-5 overflow-auto border-b p-4 lg:border-r lg:border-b-0">
            <div>
              <p className="text-muted-foreground mb-2 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
                源
              </p>
              <FeishuConfig config={config} onSaved={setConfig} />
              <div className="mt-2">
                <ParsePanel ready={ready} onParsed={handleParsed} />
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
                已解析需求
              </p>
              {specs.length === 0 ? (
                <p className="text-muted-foreground text-sm">还没有解析记录。</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {specs.map((s) => {
                    const active = s.source.documentId === selectedId
                    return (
                      <li key={s.source.documentId}>
                        <button
                          type="button"
                          onClick={() => selectSpec(s.source.documentId)}
                          className={cn(
                            'w-full rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                            active
                              ? 'border-brand/25 bg-brand/[0.07]'
                              : 'border-transparent hover:bg-muted',
                          )}
                        >
                          <div className="flex items-center gap-2 text-[13px] font-semibold">
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                active ? 'bg-brand' : 'bg-muted-foreground/50',
                              )}
                            />
                            <span className="truncate">{s.title}</span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 pl-3.5 text-[11px]">
                            {s.counts.blocks} blocks · {s.counts.images} 图
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* 工作区 */}
          {selected ? (
            <SpecView spec={selected} onPeek={setPeek} />
          ) : (
            <main className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 p-6 text-center">
              <span aria-hidden className="text-brand/50 text-2xl">
                ✦
              </span>
              <p className="text-muted-foreground max-w-xs text-sm">
                粘贴飞书链接开始解析,或从左侧选择一条已解析记录
              </p>
            </main>
          )}

          {/* 溯源 peek:封顶第三栏 */}
          {peek && selected && (
            <SourcePeek
              specId={selected.source.documentId}
              docTitle={selected.title}
              lines={peek}
              onClose={() => setPeek(null)}
            />
          )}
        </div>

      <Toaster richColors position="top-center" />
    </div>
  )
}

export default App
