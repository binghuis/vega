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

export interface VegaConfig {
  feishu?: Partial<FeishuCredentials>
}

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
