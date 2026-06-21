/**
 * 结构化两阶段 schema(回到 vega 公理:切成短的可独立验证单元)。
 *
 * 阶段A 提取(多模态,模型擅长):只抽准则 + 溯源(行号 + 图 token),不做判断。
 * 阶段B 评审(纯文本,隔离判断):三分 / 澄清 / 出范围 / 噪声行 / 可建度。
 * 覆盖账(未覆盖行 / 孤图)由代码从「引用」机器反推,不进 schema。
 *
 * 对弱模型的容错:逐字段 .catch(兜底),让「单条缺/错字段」不毁全批;
 * 代码侧再过滤明显残缺(空 statement)的条目。
 */
import { z } from 'zod'

/** 准则来源:docLines = 支撑它的正文行号;image = 对应图 token(无则 null) */
export const Source = z
  .object({
    docLines: z.array(z.number()).catch([]),
    image: z.string().nullable().catch(null),
  })
  .catch({ docLines: [], image: null })

// —— 阶段A:提取 ——
export const ExtractCriterion = z.object({
  view: z.string().catch(''),
  statement: z.string().catch(''),
  given: z.string().nullable().catch(null),
  when: z.string().nullable().catch(null),
  then: z.string().nullable().catch(null),
  verify: z.enum(['behavioral', 'visual', 'data']).catch('behavioral'),
  source: Source,
})

export const ExtractOutput = z.object({
  criteria: z.array(ExtractCriterion).catch([]),
})

// —— 阶段B:评审 ——
export const Judgment = z.object({
  index: z.number().catch(-1),
  status: z.enum(['confirmed', 'assumed']).catch('confirmed'),
  assumption: z.string().nullable().catch(null),
})

// 可建度:逐条判这条准则能否直接交给 AI 实现;gaps 空=可建,非空=待补
export const ReadinessJudgment = z.object({
  index: z.number().catch(-1),
  gaps: z.array(z.string()).catch([]),
})

export const ClarificationOut = z.object({
  question: z.string().catch(''),
  impact: z.string().catch(''),
  candidates: z.array(z.string()).catch([]),
  blocks: z.array(z.string()).catch([]),
  docLines: z.array(z.number()).catch([]),
})

export const OutOfScopeOut = z.object({
  docLines: z.array(z.number()).catch([]),
  class: z.string().catch(''),
  note: z.string().catch(''),
})

// 阶段B 再拆成 3 个「只干一件事」的极简调用,每个一个输出
export const StatusOutput = z.object({
  judgments: z.array(Judgment).catch([]),
})

export const ReadinessOutput = z.object({
  judgments: z.array(ReadinessJudgment).catch([]),
})

export const ClarifyOutput = z.object({
  clarifications: z.array(ClarificationOut).catch([]),
})

export const ScopeOutput = z.object({
  outOfScope: z.array(OutOfScopeOut).catch([]),
  noiseLines: z.array(z.number()).catch([]),
})

export type ExtractOutput = z.infer<typeof ExtractOutput>
export type ExtractCriterion = z.infer<typeof ExtractCriterion>
