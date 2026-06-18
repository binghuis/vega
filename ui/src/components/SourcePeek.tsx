import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { StateNotice } from '@/components/StateNotice'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

interface Props {
  specId: string
  docTitle: string
  /** 要展示的正文行号(1-based,对应 document.md 的行) */
  lines: number[]
  onClose: () => void
}

type Row = { n: number; text: string; hot: boolean }

type State =
  | { status: 'loading' }
  | { status: 'ready'; rows: Row[] }
  | { status: 'error'; message: string }

/**
 * 溯源面板(封顶第三栏):把准则的 docLines 映射回正文原文行。
 * 行号源:后端 structure.ts 用 document.md「split('\n') 后 1-based、保留空行编号」做溯源,
 * getMarkdown 由同一 blocksToMarkdown 还原 → 行号对齐。范围紧凑时连带展示上下文行。
 */
export function SourcePeek({ specId, docTitle, lines, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })

  // specId / lines 变化时重置(渲染期同步,替代 effect 内 setState)
  const key = `${specId}|${lines.join(',')}`
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    let alive = true
    api
      .getMarkdown(specId)
      .then((md) => {
        if (!alive) return
        setState({ status: 'ready', rows: buildRows(md, lines) })
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
    // key 覆盖 specId+lines 两个依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <aside className="bg-faint flex min-w-0 flex-col overflow-auto border-t p-4 lg:border-t-0 lg:border-l">
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden className="text-brand text-sm">
          ✦
        </span>
        <span className="text-[13px] font-semibold">溯源 · 原文</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground ml-auto leading-none"
          aria-label="关闭溯源"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="text-muted-foreground mb-3.5 truncate text-[11.5px]">
        {docTitle} · 行 L{lines.join(',')}
      </p>

      {state.status === 'loading' && (
        <StateNotice tone="loading">加载原文…</StateNotice>
      )}
      {state.status === 'error' && (
        <StateNotice tone="error">{state.message}</StateNotice>
      )}
      {state.status === 'ready' &&
        (state.rows.length === 0 ? (
          <StateNotice>未找到对应原文行。</StateNotice>
        ) : (
          <div className="flex flex-col gap-0.5">
            {state.rows.map((r) => (
              <div
                key={r.n}
                className={cn(
                  'flex gap-2.5 rounded-md px-2 py-1 text-xs leading-relaxed',
                  r.hot && 'bg-brand/[0.09]',
                )}
              >
                <span
                  className={cn(
                    'w-7 shrink-0 pt-px text-right font-mono text-[10.5px]',
                    r.hot ? 'text-brand' : 'text-muted-foreground',
                  )}
                >
                  {r.n}
                </span>
                <span className="break-words">{r.text}</span>
              </div>
            ))}
          </div>
        ))}

      <p className="text-muted-foreground bg-soft mt-4 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed">
        这是流水线最深的「源」。准则是它的产物,任意一层都能锚回这里。
      </p>
    </aside>
  )
}

/** 把 markdown 按行(1-based)取出 docLines;范围紧凑(≤12 行)时连带上下文非空行 */
function buildRows(md: string, lines: number[]): Row[] {
  if (lines.length === 0) return []
  const mdLines = md.split('\n')
  const at = (n: number) => mdLines[n - 1] ?? ''
  const cited = new Set(lines)
  const lo = Math.min(...lines)
  const hi = Math.max(...lines)

  if (hi - lo <= 12) {
    const rows: Row[] = []
    for (let n = lo; n <= hi; n++) {
      const text = at(n).trim()
      if (text.length === 0) continue // 后端编号保留空行,但空行无内容可显示
      rows.push({ n, text, hot: cited.has(n) })
    }
    return rows
  }
  // 跨度大:只列被引用的行
  return lines
    .slice()
    .sort((a, b) => a - b)
    .map((n) => ({ n, text: at(n).trim(), hot: true }))
}
