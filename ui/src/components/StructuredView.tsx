import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  FileWarning,
  ImageOff,
  Layers,
  Loader2,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  api,
  type StructuredClarification,
  type StructuredCriterion,
  type StructuredData,
} from '@/lib/api'

interface Props {
  specId: string
  /** 图片 token → 直链(无则 null) */
  imageUrl: (token: string) => string | null
}

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; data: StructuredData }
  | { status: 'error'; message: string }

const VERIFY_LABEL: Record<StructuredCriterion['verify'], string> = {
  behavioral: '行为',
  visual: '视觉',
  data: '数据',
}

export function StructuredView({ specId, imageUrl }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    api
      .getStructured(specId)
      .then((d) => {
        if (!alive) return
        setState(d ? { status: 'ready', data: d } : { status: 'empty' })
      })
      .catch(
        (e: unknown) =>
          alive &&
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : '加载失败',
          }),
      )
    return () => {
      alive = false
    }
  }, [specId])

  async function handleRun() {
    setRunning(true)
    try {
      await api.runStructure(specId)
      const d = await api.getStructured(specId)
      setState(d ? { status: 'ready', data: d } : { status: 'empty' })
      toast.success('结构化完成')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '结构化失败')
    } finally {
      setRunning(false)
    }
  }

  const runButton = (
    <Button onClick={handleRun} disabled={running} size="sm">
      {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {running ? '结构化中…' : '运行结构化'}
    </Button>
  )

  if (state.status === 'loading') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
        <Loader2 className="size-4 animate-spin" />
        加载结构化结果…
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="text-destructive py-8 text-sm">{state.message}</p>
  }

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">
          还没有结构化结果。运行后产出「带来源的准则 + 待澄清 + 覆盖账」。
        </p>
        {runButton}
        <p className="text-muted-foreground text-xs">
          需配置结构化模型(.env 的 STRUCTURE_*),一次约几次模型调用。
        </p>
      </div>
    )
  }

  const { data } = state
  const c = data.counts
  // 按 criteria.view 分组(view 可能是 id 或名,统一解析名)
  const viewName = (v: string) =>
    data.views.find((x) => x.id === v)?.name ?? v
  const grouped = new Map<string, StructuredCriterion[]>()
  for (const cr of data.criteria) {
    const arr = grouped.get(cr.view) ?? []
    arr.push(cr)
    grouped.set(cr.view, arr)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 概览 + 重跑 */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">准则 {c.criteria}</Badge>
        <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700" variant="outline">
          确定 {c.confirmed}
        </Badge>
        <Badge className="border-amber-300 bg-amber-50 text-amber-700" variant="outline">
          假设 {c.assumed}
        </Badge>
        <Badge className="border-red-300 bg-red-50 text-red-700" variant="outline">
          待澄清 {c.clarifications}
        </Badge>
        <span className="text-muted-foreground text-xs">
          覆盖账:出范围 {c.outOfScope} · 未覆盖 {c.uncovered} · 孤图 {c.unlinkedImages}
        </span>
        <div className="ml-auto">{runButton}</div>
      </div>

      {/* 待澄清(高亮置顶)*/}
      {data.clarifications.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <AlertTriangle className="size-4" />
            待澄清 · 需先问 PM({data.clarifications.length})
          </h3>
          {data.clarifications.map((q) => (
            <ClarificationCard key={q.id} q={q} />
          ))}
        </section>
      )}

      {/* 准则按视图分组 */}
      <section className="flex flex-col gap-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4" />
          准则(按视图)
        </h3>
        {[...grouped.entries()].map(([view, list]) => (
          <div key={view} className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs font-medium">
              {viewName(view)} · {list.length}
            </div>
            {list.map((cr) => (
              <CriterionCard key={cr.id} cr={cr} imageUrl={imageUrl} />
            ))}
          </div>
        ))}
      </section>

      {/* 覆盖账 */}
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ScanSearch className="size-4" />
          覆盖账
        </h3>

        {data.ledger.out_of_scope.length > 0 && (
          <LedgerBlock
            icon={<FileWarning className="size-4 text-slate-500" />}
            title={`非前端 / 出范围(${data.ledger.out_of_scope.length})`}
          >
            {data.ledger.out_of_scope.map((o, i) => (
              <li key={i} className="text-sm">
                <Badge variant="outline" className="mr-2">
                  {o.class}
                </Badge>
                {o.text || o.note}
              </li>
            ))}
          </LedgerBlock>
        )}

        {data.ledger.uncovered_source.length > 0 && (
          <LedgerBlock
            icon={<FileWarning className="size-4 text-amber-500" />}
            title={`未覆盖正文(${data.ledger.uncovered_source.length})`}
          >
            {data.ledger.uncovered_source.map((u, i) => (
              <li key={i} className="text-sm">
                <span className="text-muted-foreground mr-2">L{u.line}</span>
                {u.text}
              </li>
            ))}
          </LedgerBlock>
        )}

        {data.ledger.unlinked_images.length > 0 && (
          <LedgerBlock
            icon={<ImageOff className="size-4 text-slate-500" />}
            title={`未挂到准则的图(${data.ledger.unlinked_images.length})`}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.ledger.unlinked_images.map((im) => {
                const url = imageUrl(im.image)
                return url ? (
                  <a
                    key={im.image}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded border"
                  >
                    <img
                      src={url}
                      alt={im.image}
                      loading="lazy"
                      className="bg-muted/30 h-24 w-full object-contain"
                    />
                  </a>
                ) : null
              })}
            </div>
          </LedgerBlock>
        )}
      </section>
    </div>
  )
}

function ClarificationCard({ q }: { q: StructuredClarification }) {
  return (
    <Card className="border-amber-300 bg-amber-50/40 py-3">
      <CardContent className="flex flex-col gap-1">
        <div className="font-medium">{q.question}</div>
        <div className="text-muted-foreground text-xs">影响:{q.impact}</div>
        {q.candidates.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {q.candidates.map((cand, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {cand}
              </Badge>
            ))}
          </div>
        )}
        <div className="text-muted-foreground flex gap-3 pt-1 text-xs">
          {q.blocks.length > 0 && <span>阻塞:{q.blocks.join('、')}</span>}
          {q.docLines.length > 0 && <span>出处:L{q.docLines.join(',')}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function CriterionCard({
  cr,
  imageUrl,
}: {
  cr: StructuredCriterion
  imageUrl: (token: string) => string | null
}) {
  const thumb = cr.source.image ? imageUrl(cr.source.image) : null
  return (
    <Card className="bg-muted/50 py-3">
      <CardContent className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {cr.status === 'confirmed' ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                确定
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                假设
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {VERIFY_LABEL[cr.verify]}
            </Badge>
            <span className="font-medium">{cr.statement}</span>
          </div>
          {cr.then && (
            <div className="text-muted-foreground text-sm">则:{cr.then}</div>
          )}
          {cr.status === 'assumed' && cr.assumption && (
            <div className="text-xs text-amber-700">假设:{cr.assumption}</div>
          )}
          <div className="text-muted-foreground text-xs">
            {cr.source.docLines.length > 0 && (
              <span>溯源 L{cr.source.docLines.join(',')}</span>
            )}
          </div>
        </div>
        {thumb && (
          <a href={thumb} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={thumb}
              alt={cr.source.image ?? ''}
              loading="lazy"
              className="bg-muted/30 h-16 w-24 rounded border object-cover"
            />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function LedgerBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="bg-muted/50 rounded-md p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {Array.isArray(children) || typeof children === 'string' ? (
        <ul className="flex list-none flex-col gap-1">{children}</ul>
      ) : (
        children
      )}
    </div>
  )
}
