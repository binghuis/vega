/**
 * 运行时配置:飞书凭据等。
 *
 * 来源优先级(高 → 低):
 *   1. .vega/config.json —— 用户在网页里填、服务端落盘的那份(主路径)
 *   2. 环境变量(.env)   —— 本地/CI 兜底
 *
 * 凭据是敏感数据:.vega/ 已在 .gitignore,只存本地。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface FeishuCredentials {
  /** 飞书自建应用 app_id(形如 cli_xxx),非机密 */
  appId: string
  /** 飞书自建应用 app_secret,机密 */
  appSecret: string
  /** 开放平台域名,默认飞书国内版;Lark 国际版用 https://open.larksuite.com */
  baseUrl: string
}

/** 结构化模型 provider 配置(可替换:Claude 或任意 OpenAI 兼容服务) */
export interface StructureConfig {
  /** anthropic = Claude;openai = OpenAI 兼容(智谱 GLM-4V / 通义 Qwen-VL / Gemini / Ollama) */
  provider: 'anthropic' | 'openai'
  /** OpenAI 兼容服务的 base url(provider=openai 时用) */
  baseUrl: string
  model: string
  apiKey: string
  /** 输出上限(不同模型差异大,如智谱 glm-4v-flash 仅 1024) */
  maxTokens: number
  /** 启用深度思考(部分模型,如智谱 GLM-4.5+/5 系);OpenAI 兼容路径透传 thinking */
  thinking: boolean
}

export interface VegaConfig {
  feishu?: Partial<FeishuCredentials>
  structure?: Partial<StructureConfig>
}

/** OpenAI 兼容默认指向智谱(国内·免费档·视觉) */
const DEFAULT_OPENAI_BASE = 'https://open.bigmodel.cn/api/paas/v4'

const DEFAULT_BASE_URL = 'https://open.feishu.cn'

/** 配置目录:仓库根下 .vega/(运行时产物,已 gitignore) */
export const VEGA_DIR = path.resolve(process.cwd(), '.vega')
const CONFIG_PATH = path.join(VEGA_DIR, 'config.json')

async function readConfigFile(): Promise<VegaConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8')
    return JSON.parse(raw) as VegaConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`读取 ${CONFIG_PATH} 失败:${(err as Error).message}`)
  }
}

/**
 * 解析飞书凭据。缺 appId/appSecret 抛错并指明怎么补,
 * 让上层(CLI / 接口)能把「去网页填 / 去 .env 填」原样透传给用户。
 */
export async function loadFeishuCredentials(): Promise<FeishuCredentials> {
  const fileCfg = (await readConfigFile()).feishu ?? {}

  const appId = fileCfg.appId ?? process.env.FEISHU_APP_ID ?? ''
  const appSecret = fileCfg.appSecret ?? process.env.FEISHU_APP_SECRET ?? ''
  const baseUrl =
    fileCfg.baseUrl ?? process.env.FEISHU_BASE_URL ?? DEFAULT_BASE_URL

  const missing: string[] = []
  if (!appId) missing.push('appId')
  if (!appSecret) missing.push('appSecret')
  if (missing.length > 0) {
    throw new Error(
      `飞书凭据缺失:${missing.join('、')}。` +
        `请在网页「飞书配置」里填写,或写入 .vega/config.json / .env(FEISHU_APP_ID、FEISHU_APP_SECRET)。`,
    )
  }

  return { appId, appSecret, baseUrl: baseUrl.replace(/\/+$/, '') }
}

/** 配置状态(给网页表单回显用):不抛错,不返回 secret 明文 */
export async function readFeishuConfigState(): Promise<{
  appId: string
  hasSecret: boolean
  baseUrl: string
  ready: boolean
}> {
  const fileCfg = (await readConfigFile()).feishu ?? {}
  const appId = fileCfg.appId ?? process.env.FEISHU_APP_ID ?? ''
  const hasSecret = Boolean(fileCfg.appSecret ?? process.env.FEISHU_APP_SECRET)
  const baseUrl =
    fileCfg.baseUrl ?? process.env.FEISHU_BASE_URL ?? DEFAULT_BASE_URL
  return { appId, hasSecret, baseUrl, ready: Boolean(appId) && hasSecret }
}

/** 网页「飞书配置」表单提交时由服务端调用,合并落盘(不覆盖未提交字段)。 */
export async function saveFeishuCredentials(
  patch: Partial<FeishuCredentials>,
): Promise<void> {
  const current = await readConfigFile()
  const next: VegaConfig = {
    ...current,
    feishu: { ...current.feishu, ...patch },
  }
  await fs.mkdir(VEGA_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
}

/**
 * 解析结构化模型配置。优先级:.vega/config.json.structure → 环境变量 → 默认。
 * provider=anthropic 用 ANTHROPIC_API_KEY;provider=openai 用 STRUCTURE_API_KEY。
 */
export async function loadStructureConfig(): Promise<StructureConfig> {
  const fileCfg = (await readConfigFile()).structure ?? {}
  const provider = (fileCfg.provider ??
    process.env.STRUCTURE_PROVIDER ??
    'anthropic') as 'anthropic' | 'openai'

  const defaultModel = provider === 'anthropic' ? 'claude-opus-4-8' : 'glm-4v-flash'
  const baseUrl = fileCfg.baseUrl ?? process.env.STRUCTURE_BASE_URL ?? DEFAULT_OPENAI_BASE
  const model = fileCfg.model ?? process.env.STRUCTURE_MODEL ?? defaultModel
  const maxTokens = Number(
    fileCfg.maxTokens ??
      process.env.STRUCTURE_MAX_TOKENS ??
      (provider === 'anthropic' ? 16000 : 4096),
  )
  const thinking =
    fileCfg.thinking ??
    ['enabled', 'true', '1'].includes(process.env.STRUCTURE_THINKING ?? '')
  const apiKey =
    fileCfg.apiKey ??
    process.env.STRUCTURE_API_KEY ??
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined) ??
    ''

  if (!apiKey) {
    throw new Error(
      provider === 'anthropic'
        ? '缺少 ANTHROPIC_API_KEY(或 STRUCTURE_API_KEY)'
        : '缺少结构化模型 key:填 STRUCTURE_API_KEY(智谱在 open.bigmodel.cn 拿),或写入 .vega/config.json 的 structure.apiKey',
    )
  }
  return { provider, baseUrl, model, apiKey, maxTokens, thinking }
}
