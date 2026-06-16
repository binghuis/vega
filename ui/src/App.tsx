import { useEffect, useState } from 'react'
import { FileStack } from 'lucide-react'

import { FeishuConfig } from '@/components/FeishuConfig'
import { ParsePanel } from '@/components/ParsePanel'
import { SpecView } from '@/components/SpecView'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { api, type FeishuConfigState, type SpecManifest } from '@/lib/api'

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
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          ✦ Vega · 织女 —— 需求解析
        </h1>
        <p className="text-muted-foreground text-sm">
          飞书需求文档 → 解析正文与图片 → 落盘(下一步:需求结构化)
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* 左:配置 + 解析 + 已解析列表 */}
        <div className="flex flex-col gap-6">
          <FeishuConfig config={config} onSaved={setConfig} />
          <ParsePanel ready={ready} onParsed={handleParsed} />

          <div>
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
              <FileStack className="size-4" />
              已解析需求
              <Badge variant="secondary">{specs.length}</Badge>
            </div>
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
                        onClick={() => setSelectedId(s.source.documentId)}
                        className={
                          'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ' +
                          (active
                            ? 'border-ring bg-accent'
                            : 'hover:bg-accent/50')
                        }
                      >
                        <div className="truncate font-medium">{s.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {s.counts.blocks} blocks · {s.counts.images} 图
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* 右:解析结果 */}
        <div>
          {selected ? (
            <SpecView spec={selected} />
          ) : (
            <div className="text-muted-foreground flex h-full min-h-60 items-center justify-center rounded-xl border border-dashed text-sm">
              粘贴飞书链接开始解析,或从左侧选择一条已解析记录
            </div>
          )}
        </div>
      </div>

      <Toaster richColors position="top-center" />
    </div>
  )
}

export default App
