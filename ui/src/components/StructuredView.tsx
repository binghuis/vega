import { useEffect, useState, type ReactNode } from 'react'
import {
  FileWarning,
  ImageOff,
  Loader2,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { StateNotice } from '@/components/StateNotice'
import { Thumbnail } from '@/components/Thumbnail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
  /** 点溯源行号 → 展开外壳第三栏(null 收起) */
  onPeek: (lines: number[] | null) => void
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

// 组头色点 = 可建度分组的唯一出处;卡内 chip 是「来源」(另一根轴),不重复分组状态
const DOT = {
  clarification: 'bg-destructive',
  buildable: 'bg-success',
  needsInfo: 'bg-warning',
} as const

export function StructuredView({ specId, imageUrl, onPeek }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [running, setRunning] = useState(false)

  // 切换需求(specId 变化)时渲染期重置为加载态
  const [prevSpecId, setPrevSpecId] = useState(specId)
  if (specId !== prevSpecId) {
    setPrevSpecId(specId)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    let alive = true
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

  // 记录待澄清答案:乐观更新本地态;失败则重新拉取回到真值
  async function handleAnswer(cid: string, answer: string | null) {
    setState((s) =>
      s.status === 'ready'
        ? {
            ...s,
            data: {
              ...s.data,
              clarifications: s.data.clarifications.map((q) =>
                q.id === cid ? { ...q, answer } : q,
              ),
            },
          }
        : s,
    )
    try {
      await api.answerClarification(specId, cid, answer)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存答案失败')
      const d = await api.getStructured(specId).catch(() => null)
      if (d) setState({ status: 'ready', data: d })
    }
  }

  const runButton = (idleLabel: string) => (
    <Button onClick={handleRun} disabled={running} size="sm" variant="outline">
      {running ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {running ? '结构化中…' : idleLabel}
    </Button>
  )

  if (state.status === 'loading') {
    return (
      <StateNotice tone="loading" className="py-8">
        加载结构化结果…
      </StateNotice>
    )
  }

  if (state.status === 'error') {
    return (
      <StateNotice tone="error" className="py-8">
        {state.message}
      </StateNotice>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">
          还没有结构化结果。运行后产出「带来源的准则 + 待澄清 + 覆盖账」。
        </p>
        {runButton('运行结构化')}
        <p className="text-muted-foreground text-xs">
          需配置结构化模型(.env 的 STRUCTURE_*),一次约几次模型调用。
        </p>
      </div>
    )
  }

  const { data } = state
  // 主轴:可建度(gaps 空=可直接交给 AI 建);来源(confirmed/assumed)退为卡内 chip
  const buildable = data.criteria.filter((c) => (c.gaps?.length ?? 0) === 0)
  const needsInfo = data.criteria.filter((c) => (c.gaps?.length ?? 0) > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 + 重跑 */}
      <div className="flex items-baseline gap-3">
        <h3 className="font-serif text-[21px] font-semibold tracking-tight">
          结构化准则
        </h3>
        <span className="text-muted-foreground text-[12.5px]">
          可建 {buildable.length} · 待补 {needsInfo.length} · 共{' '}
          {data.counts.criteria} 项
        </span>
        <div className="ml-auto self-center">{runButton('重新结构化')}</div>
      </div>

      {/* 待澄清(置顶) */}
      {data.clarifications.length > 0 && (
        <StatusGroup
          tone="clarification"
          title="待澄清"
          hint="需先问 PM"
          count={data.clarifications.length}
        >
          {data.clarifications.map((q) => (
            <ClarificationCard
              key={q.id}
              q={q}
              onAnswer={handleAnswer}
              onPeek={onPeek}
            />
          ))}
        </StatusGroup>
      )}

      {needsInfo.length > 0 && (
        <StatusGroup
          tone="needsInfo"
          title="待补"
          hint="缺核心信息 · 补全才能建"
          count={needsInfo.length}
        >
          {needsInfo.map((cr) => (
            <CriterionCard
              key={cr.id}
              cr={cr}
              imageUrl={imageUrl}
              onPeek={onPeek}
            />
          ))}
        </StatusGroup>
      )}

      {buildable.length > 0 && (
        <StatusGroup
          tone="buildable"
          title="确定"
          hint="可直接交给 AI 实现"
          count={buildable.length}
        >
          {buildable.map((cr) => (
            <CriterionCard
              key={cr.id}
              cr={cr}
              imageUrl={imageUrl}
              onPeek={onPeek}
            />
          ))}
        </StatusGroup>
      )}

      {/* 覆盖账(设计 mock 未画,作为现有功能保留) */}
      <Ledger data={data} imageUrl={imageUrl} onPeek={onPeek} />
    </div>
  )
}

function StatusGroup({
  tone,
  title,
  hint,
  count,
  children,
}: {
  tone: keyof typeof DOT
  title: string
  hint: string
  count: number
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5 pl-0.5">
        <span className={cn('size-2 shrink-0 rounded-full', DOT[tone])} />
        <span className="font-serif text-[17px] font-semibold tracking-tight">
          {title}
        </span>
        <span className="text-muted-foreground text-xs">
          {hint} · {count} 项
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/** 溯源行号 → 点开第三栏 */
function SourceRef({
  lines,
  onPeek,
}: {
  lines: number[]
  onPeek: (lines: number[] | null) => void
}) {
  if (lines.length === 0) return null
  return (
    <span className="text-muted-foreground text-[11px]">
      溯源{' '}
      <button
        type="button"
        onClick={() => onPeek(lines)}
        className="bg-muted hover:bg-brand/15 hover:text-brand rounded-[5px] px-1.5 py-0.5 font-mono transition-colors"
      >
        L{lines.join(',')}
      </button>
    </span>
  )
}

function CriterionCard({
  cr,
  imageUrl,
  onPeek,
}: {
  cr: StructuredCriterion
  imageUrl: (token: string) => string | null
  onPeek: (lines: number[] | null) => void
}) {
  const thumb = cr.source.image ? imageUrl(cr.source.image) : null
  return (
    <div className="bg-soft rounded-card flex gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-muted-foreground rounded-chip shrink-0 border px-1.5 text-[11px]">
            {VERIFY_LABEL[cr.verify]}
          </span>
          {cr.status === 'assumed' && (
            <span className="text-warning border-warning/40 rounded-chip shrink-0 border px-1.5 text-[11px]">
              AI 补·待复核
            </span>
          )}
          <span className="text-[13.5px] leading-relaxed font-semibold">
            {cr.statement}
          </span>
        </div>
        {cr.then && (
          <div className="text-muted-foreground mt-1 text-[13px]">
            则:{cr.then}
          </div>
        )}
        {cr.status === 'assumed' && cr.assumption && (
          <div className="text-warning mt-1 text-xs">假设:{cr.assumption}</div>
        )}
        {cr.gaps && cr.gaps.length > 0 && (
          <div className="text-warning mt-1.5 text-xs">
            待补 {cr.gaps.length} 项才能建:
            <ul className="mt-0.5 ml-3.5 list-disc space-y-0.5">
              {cr.gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-2">
          <SourceRef lines={cr.source.docLines} onPeek={onPeek} />
        </div>
      </div>
      {thumb && (
        <Thumbnail
          src={thumb}
          alt={cr.source.image ?? ''}
          fit="cover"
          className="h-16 w-24 shrink-0"
        />
      )}
    </div>
  )
}

function ClarificationCard({
  q,
  onAnswer,
  onPeek,
}: {
  q: StructuredClarification
  onAnswer: (cid: string, answer: string | null) => void
  onPeek: (lines: number[] | null) => void
}) {
  // 答案落在候选之外 → 是「其他」自定义文本
  const customActive = q.answer != null && !q.candidates.includes(q.answer)
  const [editing, setEditing] = useState(false)
  const [otherText, setOtherText] = useState('')

  function pick(cand: string) {
    setEditing(false)
    onAnswer(q.id, q.answer === cand ? null : cand) // 再点已选 = 取消
  }
  function toggleOther() {
    setOtherText(customActive ? (q.answer ?? '') : '')
    setEditing((e) => !e)
  }
  function submitOther() {
    onAnswer(q.id, otherText.trim() || null)
    setEditing(false)
  }

  const chip =
    'rounded-pill border px-2.5 py-1 text-xs transition-colors'
  const chipOn = 'border-brand bg-brand/10 text-brand font-medium'
  const chipOff = 'hover:bg-muted'

  return (
    <div className="border-destructive/25 bg-soft-alert rounded-card flex flex-col gap-2 border p-4">
      <div className="text-[13.5px] font-semibold">{q.question}</div>
      <div className="text-muted-foreground text-xs">影响:{q.impact}</div>

      {/* 回答:选候选 / 填其他 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {q.candidates.map((cand, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pick(cand)}
            className={cn(chip, q.answer === cand ? chipOn : chipOff)}
          >
            {cand}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleOther}
          className={cn(chip, customActive ? chipOn : chipOff)}
        >
          {customActive ? `其他:${q.answer}` : '其他'}
        </button>
      </div>

      {editing && (
        <div className="flex gap-2">
          <Input
            autoFocus
            className="h-8 text-xs"
            placeholder="自定义答案…"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitOther()
            }}
          />
          <Button size="sm" variant="secondary" onClick={submitOther}>
            保存
          </Button>
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        {q.blocks.length > 0 && <span>阻塞:{q.blocks.join('、')}</span>}
        <SourceRef lines={q.docLines} onPeek={onPeek} />
      </div>
    </div>
  )
}

function Ledger({
  data,
  imageUrl,
  onPeek,
}: {
  data: StructuredData
  imageUrl: (token: string) => string | null
  onPeek: (lines: number[] | null) => void
}) {
  const { out_of_scope, uncovered_source, unlinked_images } = data.ledger
  if (
    out_of_scope.length === 0 &&
    uncovered_source.length === 0 &&
    unlinked_images.length === 0
  ) {
    return null
  }
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5 pl-0.5">
        <ScanSearch className="text-muted-foreground size-4" />
        <span className="font-serif text-[17px] font-semibold tracking-tight">
          覆盖账
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {out_of_scope.length > 0 && (
          <LedgerBlock
            icon={<FileWarning className="text-muted-foreground size-4" />}
            title={`非前端 / 出范围(${out_of_scope.length})`}
          >
            {out_of_scope.map((o, i) => (
              <li key={i} className="text-sm">
                <Badge variant="outline" className="mr-2">
                  {o.class}
                </Badge>
                {o.text || o.note}
              </li>
            ))}
          </LedgerBlock>
        )}

        {uncovered_source.length > 0 && (
          <LedgerBlock
            icon={<FileWarning className="text-warning size-4" />}
            title={`未覆盖正文(${uncovered_source.length})`}
          >
            {uncovered_source.map((u, i) => (
              <li key={i} className="text-sm">
                <button
                  type="button"
                  onClick={() => onPeek([u.line])}
                  className="text-muted-foreground hover:text-brand mr-2 font-mono text-xs"
                >
                  L{u.line}
                </button>
                {u.text}
              </li>
            ))}
          </LedgerBlock>
        )}

        {unlinked_images.length > 0 && (
          <LedgerBlock
            icon={<ImageOff className="text-muted-foreground size-4" />}
            title={`未挂到准则的图(${unlinked_images.length})`}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {unlinked_images.map((im) => {
                const url = imageUrl(im.image)
                return url ? (
                  <Thumbnail
                    key={im.image}
                    src={url}
                    alt={im.image}
                    className="h-24"
                  />
                ) : null
              })}
            </div>
          </LedgerBlock>
        )}
      </div>
    </section>
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
    <div className="bg-soft rounded-card p-3">
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
