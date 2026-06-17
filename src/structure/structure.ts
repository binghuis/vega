/**
 * 需求结构化(两阶段 + 机器算覆盖账 + 退化重试,回到 vega 公理)。
 *
 * 阶段A 提取(多模态):正文(按行编号)+ 图 → 准则 + 溯源(行号/图 token)。弱模型擅长,出 0 条则重试。
 * 阶段B 评审(纯文本,隔离判断):三分(confirmed/assumed)+ 澄清(扫待定)+ 出范围 + 噪声行。
 * 机器侧:从「引用」反推未覆盖行 / 孤图(不问模型);稳定 id;stats。
 *
 * 产物:.vega/specs/<documentId>/structured.json,并回填 manifest.structured 摘要。
 */
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { VEGA_DIR, loadStructureConfig } from '../config'
import type { SpecManifest } from '../parse/feishu'
import { callModel, type Part } from './providers'
import {
  ClarifyOutput,
  ExtractOutput,
  ScopeOutput,
  StatusOutput,
} from './schema'

const MEDIA_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const SYSTEM_EXTRACT = `你是需求提取员。输入:正文(每行以 L<编号> 标注)+ 若干图(每张带 token)。从中提取所有【前端】需求。
- 每条准则:view(所属视图的【中文名】,如「项目列表」「编辑器」「文件夹」,不要用英文 id)、statement(一句话)、given/when/then(不适用填 null)、verify(behavioral 可断言行为 / visual 对视觉 / data 数据字段)、source(docLines=支撑它的正文行号数组、image=对应图 token 或 null)
- 只做「提取 + 溯源」,不做任何判断(不分确定/假设、不挑歧义、不写覆盖账)
- 需求意图大量在图里,务必结合图;每条尽量给 docLines
全中文。顶层输出对象恰好 {criteria},criteria 不能为空。id 不用给。`

// 阶段B 拆成 3 个「只干一件事」的极简调用(弱模型更容易做对)
const SYSTEM_STATUS = `你是需求评审员。输入:正文(每行 L<编号>)+ 已提取准则清单(C<下标>)。只做一件事:逐条判 status。
- 正文里 PM 明确写出的功能/规则 → confirmed(**绝大多数都是**)
- 只有「文档没写、你替它补的默认值」→ assumed,并在 assumption 写补了什么
输出 {judgments:[{index, status, assumption}]},index 用 C 的下标。全中文。`

const SYSTEM_CLARIFY = `你是需求评审员。只做一件事:在正文(每行 L<编号>)里找出【必须先问 PM 才能动工】的高代价歧义。
判据:改架构/范围/方向、PM 没拍板、错了会整块返工。**逐行找「待定 / TBD / 待确认 / (待定)」字样,出现就必须列为一条**。参数/数值/文案这类不要列。
输出 {clarifications:[{question, impact, candidates(候选答案), blocks(受阻的功能或视图名), docLines(出处行号)}]};没有就给空数组。全中文。`

const SYSTEM_SCOPE = `你是需求评审员。只做一件事:在正文(每行 L<编号>)里挑出【非前端】内容与噪声行。
- outOfScope:算法/后端/模型类(如 识别说话人、台词拆分合并、换行问题、原文译文轴数对齐、算法效果优化)→ {docLines, class, note}
- noiseLines:纯元信息行(标题、版本号/修订日期/修订说明/修订状态/修订人 这类表头与记录)的行号
输出 {outOfScope:[...], noiseLines:[...]};没有就给空数组。全中文。`

// 示例实例(给弱模型仿写;结构需与 schema 一致)
const EXAMPLE_EXTRACT = JSON.stringify({
  criteria: [
    {
      view: '项目列表',
      statement: '项目列表展示视频时长',
      given: '进入项目列表',
      when: null,
      then: '显示视频时长,取源视频,格式 00:02:32',
      verify: 'visual',
      source: { docLines: [12, 13], image: 'NCXybi1p2ob99SxiaPtcXZghnQf' },
    },
  ],
})

const EXAMPLE_STATUS = JSON.stringify({
  judgments: [
    { index: 0, status: 'confirmed', assumption: null },
    { index: 1, status: 'assumed', assumption: '文档未写字号档位,默认 小/中/大 三档' },
  ],
})

const EXAMPLE_CLARIFY = JSON.stringify({
  clarifications: [
    {
      question: '画面内直接改字幕本期是否实现?',
      impact: '改编辑器交互架构,错判整块返工',
      candidates: ['A 本期实现', 'B 标待定不做'],
      blocks: ['编辑器'],
      docLines: [40],
    },
  ],
})

const EXAMPLE_SCOPE = JSON.stringify({
  outOfScope: [{ docLines: [88, 89], class: '算法', note: '识别说话人,非前端' }],
  noiseLines: [1, 2, 3],
})

function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8)
}

type Progress = (msg: string) => void

export interface StructuredSummary {
  generatedAt: string
  counts: {
    criteria: number
    confirmed: number
    assumed: number
    clarifications: number
    uncovered: number
    outOfScope: number
    unlinkedImages: number
  }
}

export interface StructureResult {
  specDir: string
  summary: StructuredSummary
}

export async function structureSpec(
  documentId: string,
  onProgress: Progress = () => {},
): Promise<StructureResult> {
  const specDir = path.join(VEGA_DIR, 'specs', documentId)
  const manifest = JSON.parse(
    await fs.readFile(path.join(specDir, 'manifest.json'), 'utf8'),
  ) as SpecManifest
  const documentRaw = await fs.readFile(path.join(specDir, 'document.md'), 'utf8')

  // 正文按行编号(只留非空行),供模型用行号溯源、机器算覆盖账
  const lines = documentRaw
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }))
    .filter((l) => l.text.trim().length > 0)
  const lineText = new Map(lines.map((l) => [l.n, l.text]))
  const numberedDoc = lines.map((l) => `L${l.n}: ${l.text}`).join('\n')

  const cfg = await loadStructureConfig()

  // —— 阶段A:提取(多模态)——
  const extractParts: Part[] = [
    {
      kind: 'text',
      text: `需求标题《${manifest.title}》。正文(每行 L<编号>):\n\n${numberedDoc}\n\n下面是图片(每张带 token),用于补全图里的需求意图:`,
    },
  ]
  for (const [i, asset] of manifest.assets.entries()) {
    const ext = asset.file.split('.').pop()?.toLowerCase() ?? 'png'
    const dataB64 = (
      await fs.readFile(path.join(specDir, asset.file))
    ).toString('base64')
    extractParts.push({
      kind: 'text',
      text: `第 ${i + 1} 张图 token=${asset.fileToken}:`,
    })
    extractParts.push({
      kind: 'image',
      mediaType: MEDIA_TYPE[ext] ?? 'image/png',
      dataB64,
    })
  }

  onProgress(`阶段A 提取(多模态)→ ${cfg.provider}:${cfg.model}…`)
  let extract = await callModel(
    SYSTEM_EXTRACT,
    extractParts,
    ExtractOutput,
    cfg,
    EXAMPLE_EXTRACT,
  )
  if (extract.criteria.length === 0) {
    onProgress('阶段A 出 0 条,退化重试一次…')
    extract = await callModel(
      SYSTEM_EXTRACT,
      extractParts,
      ExtractOutput,
      cfg,
      EXAMPLE_EXTRACT,
    )
  }
  // 过滤明显残缺(空 statement)的条目,并显式报告丢弃数(不静默)
  const items = extract.criteria.filter((c) => c.statement.trim().length > 0)
  for (const it of items) if (!it.view.trim()) it.view = '未分组'
  // 视图列表由机器从准则去重得到(避免模型 id/名 错配)
  const viewNames = [...new Set(items.map((c) => c.view))]
  const dropped = extract.criteria.length - items.length
  onProgress(
    `阶段A:${items.length} 条准则 / ${viewNames.length} 视图` +
      (dropped > 0 ? `(丢弃 ${dropped} 条残缺)` : ''),
  )

  // —— 阶段B:评审(纯文本,隔离判断)——
  const criteriaList = items
    .map((c, i) => `C${i}: [${c.view}] ${c.statement}`)
    .join('\n')
  const statusParts: Part[] = [
    {
      kind: 'text',
      text: `正文(每行 L<编号>):\n${numberedDoc}\n\n已提取准则:\n${criteriaList}`,
    },
  ]
  const docParts: Part[] = [
    { kind: 'text', text: `正文(每行 L<编号>):\n${numberedDoc}` },
  ]

  onProgress('阶段B1 判 status…')
  const status = await callModel(
    SYSTEM_STATUS,
    statusParts,
    StatusOutput,
    cfg,
    EXAMPLE_STATUS,
  )
  onProgress('阶段B2 扫待澄清…')
  const clarify = await callModel(
    SYSTEM_CLARIFY,
    docParts,
    ClarifyOutput,
    cfg,
    EXAMPLE_CLARIFY,
  )
  onProgress('阶段B3 扫出范围+噪声…')
  const scope = await callModel(
    SYSTEM_SCOPE,
    docParts,
    ScopeOutput,
    cfg,
    EXAMPLE_SCOPE,
  )

  // —— 合并 status + 稳定 id ——
  const statusByIndex = new Map(status.judgments.map((j) => [j.index, j]))
  const criteria = items.map((c, i) => {
    const j = statusByIndex.get(i)
    return {
      id: `C_${shortHash(c.statement + JSON.stringify(c.source))}`,
      view: c.view,
      status: j?.status ?? 'confirmed', // 默认 confirmed(PM 明示居多)
      verify: c.verify,
      statement: c.statement,
      given: c.given,
      when: c.when,
      then: c.then,
      assumption: j?.assumption ?? null,
      source: c.source,
    }
  })
  const clarifications = clarify.clarifications.map((q) => ({
    id: `Q_${shortHash(q.question)}`,
    ...q,
  }))

  // —— 机器算覆盖账:从引用反推,不问模型 ——
  const covered = new Set<number>()
  for (const c of criteria) for (const n of c.source.docLines) covered.add(n)
  for (const q of clarify.clarifications) for (const n of q.docLines) covered.add(n)
  for (const o of scope.outOfScope) for (const n of o.docLines) covered.add(n)
  for (const n of scope.noiseLines) covered.add(n)

  const uncovered_source = lines
    .filter((l) => !covered.has(l.n))
    .map((l) => ({
      line: l.n,
      text: l.text,
      why: '未被任何准则 / 澄清 / 出范围引用',
      action: '需澄清或补默认',
    }))

  const referencedImages = new Set(
    criteria.flatMap((c) => (c.source.image ? [c.source.image] : [])),
  )
  const unlinked_images = manifest.assets
    .filter((a) => !referencedImages.has(a.fileToken))
    .map((a) => ({
      image: a.fileToken,
      why: '未挂到任何准则',
      action: '确认是上下文图还是漏提需求',
    }))

  const out_of_scope = scope.outOfScope.map((o) => ({
    docLines: o.docLines,
    text: o.docLines.map((n) => lineText.get(n) ?? '').join(' / '),
    class: o.class,
    note: o.note,
  }))

  const ledger = {
    uncovered_source,
    out_of_scope,
    unlinked_images,
    unsourced_criteria: [] as string[],
  }

  const summary: StructuredSummary = {
    generatedAt: new Date().toISOString(),
    counts: {
      criteria: criteria.length,
      confirmed: criteria.filter((c) => c.status === 'confirmed').length,
      assumed: criteria.filter((c) => c.status === 'assumed').length,
      clarifications: clarifications.length,
      uncovered: uncovered_source.length,
      outOfScope: out_of_scope.length,
      unlinkedImages: unlinked_images.length,
    },
  }

  const structured = {
    source: { documentId, title: manifest.title },
    ...summary,
    views: viewNames.map((name) => ({ id: name, name })),
    criteria,
    clarifications,
    ledger,
  }

  await fs.writeFile(
    path.join(specDir, 'structured.json'),
    JSON.stringify(structured, null, 2),
    'utf8',
  )
  manifest.structured = summary
  await fs.writeFile(
    path.join(specDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )

  onProgress(`结构化完成 → ${path.join(specDir, 'structured.json')}`)
  return { specDir, summary }
}
