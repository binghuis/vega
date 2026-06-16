/**
 * 飞书需求文档解析 → 落盘。
 *
 * 纯代码、确定性(对标 DESIGN §5 的 Figma API 拉取),不经 LLM/MCP:
 *   链接 → (wiki 则先解析) → document_id
 *        → 取正文(raw_content)+ 全量 blocks
 *        → 从 blocks 提取图片 token 并下载
 *        → 落盘 .vega/specs/<documentId>/{document.md, blocks.json, assets/, manifest.json}
 *
 * 鉴权:tenant_access_token(app_id + app_secret),凭据来自运行时配置(网页填)。
 * 不实现「需求结构化」——manifest.structured 留空位给下一步。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { loadFeishuCredentials, VEGA_DIR } from '../config'
import { parseFeishuUrl } from './feishu-url'

/** 飞书开放接口统一响应包络 */
interface FeishuEnvelope<T> {
  code: number
  msg: string
  data: T
}

/** docx block(只声明用到的字段,其余透传进 blocks.json) */
interface DocxBlock {
  block_id: string
  block_type: number
  /** 图片块(block_type === 27)携带 image.token */
  image?: { token: string; width?: number; height?: number }
  [k: string]: unknown
}

export interface SpecAsset {
  fileToken: string
  /** 相对 spec 目录的路径,如 assets/xxx.png */
  file: string
  /** 所属 block,供后续结构化定位图片位置 */
  blockId: string
}

export interface SpecManifest {
  source: {
    url: string
    kind: 'docx' | 'wiki'
    /** wiki 链接时记录原始 wiki node token */
    wikiToken?: string
    documentId: string
  }
  title: string
  fetchedAt: string
  document: string
  blocks: string
  assets: SpecAsset[]
  counts: { blocks: number; images: number; bytes: number }
  /** 给下一步「需求结构化」预留,本阶段恒为 null */
  structured: null
}

export interface ParseResult {
  specDir: string
  manifest: SpecManifest
}

type Progress = (msg: string) => void

const IMAGE_BLOCK_TYPE = 27

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
}

/** 飞书 API 客户端:tenant_access_token 缓存 + 鉴权请求 */
class FeishuClient {
  private token: string | null = null
  /** token 过期的时间戳(ms),留 60s 安全边界 */
  private tokenExpiresAt = 0

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly baseUrl: string,
  ) {}

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token

    const res = await fetch(
      `${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      },
    )
    const body = (await res.json()) as {
      code: number
      msg: string
      tenant_access_token?: string
      expire?: number
    }
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new Error(`获取 tenant_access_token 失败(code ${body.code}):${body.msg}`)
    }
    this.token = body.tenant_access_token
    this.tokenExpiresAt = Date.now() + (body.expire ?? 7200) * 1000 - 60_000
    return this.token
  }

  /** 鉴权 GET,自动拆包络;code !== 0 抛错 */
  private async apiGet<T>(pathAndQuery: string): Promise<T> {
    const token = await this.getToken()
    const res = await fetch(`${this.baseUrl}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json()) as FeishuEnvelope<T>
    if (body.code !== 0) {
      throw new Error(`飞书接口 ${pathAndQuery} 失败(code ${body.code}):${body.msg}`)
    }
    return body.data
  }

  /** wiki 节点 → 实际对象(obj_token / obj_type) */
  async resolveWikiNode(
    wikiToken: string,
  ): Promise<{ objToken: string; objType: string }> {
    const data = await this.apiGet<{
      node: { obj_token: string; obj_type: string }
    }>(`/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`)
    return { objToken: data.node.obj_token, objType: data.node.obj_type }
  }

  /** 文档元信息(取标题) */
  async getDocumentMeta(documentId: string): Promise<{ title: string }> {
    const data = await this.apiGet<{
      document: { document_id: string; title: string }
    }>(`/open-apis/docx/v1/documents/${documentId}`)
    return { title: data.document.title }
  }

  /** 文档正文纯文本 */
  async getRawContent(documentId: string): Promise<string> {
    const data = await this.apiGet<{ content: string }>(
      `/open-apis/docx/v1/documents/${documentId}/raw_content?lang=0`,
    )
    return data.content
  }

  /** 全量 blocks(翻页拉完) */
  async getAllBlocks(documentId: string): Promise<DocxBlock[]> {
    const all: DocxBlock[] = []
    let pageToken: string | undefined
    do {
      const query = new URLSearchParams({ page_size: '500' })
      if (pageToken) query.set('page_token', pageToken)
      const data = await this.apiGet<{
        items: DocxBlock[]
        page_token?: string
        has_more: boolean
      }>(`/open-apis/docx/v1/documents/${documentId}/blocks?${query.toString()}`)
      all.push(...data.items)
      pageToken = data.has_more ? data.page_token : undefined
    } while (pageToken)
    return all
  }

  /** 下载素材(图片等),返回字节 + content-type */
  async downloadMedia(
    fileToken: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const token = await this.getToken()
    const res = await fetch(
      `${this.baseUrl}/open-apis/drive/v1/medias/${fileToken}/download`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      // 失败时多半是 JSON 错误包络
      let detail = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { code?: number; msg?: string }
        if (j.msg) detail = `code ${j.code}:${j.msg}`
      } catch {
        /* 非 JSON,沿用 HTTP 状态 */
      }
      throw new Error(`下载素材 ${fileToken} 失败(${detail})`)
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const bytes = Buffer.from(await res.arrayBuffer())
    return { bytes, contentType }
  }
}

function extFromContentType(contentType: string): string {
  const base = contentType.split(';')[0]!.trim().toLowerCase()
  return CONTENT_TYPE_EXT[base] ?? 'bin'
}

/** 从 blocks 里挑出图片块(token + 所属 block) */
function collectImageBlocks(
  blocks: DocxBlock[],
): { fileToken: string; blockId: string }[] {
  const out: { fileToken: string; blockId: string }[] = []
  for (const b of blocks) {
    const token = b.image?.token
    if ((b.block_type === IMAGE_BLOCK_TYPE || token) && token) {
      out.push({ fileToken: token, blockId: b.block_id })
    }
  }
  return out
}

/**
 * 解析飞书需求文档并落盘。
 * @returns 落盘目录与 manifest
 */
export async function parseFeishuDoc(
  url: string,
  onProgress: Progress = () => {},
): Promise<ParseResult> {
  // 先做无需网络/凭据的链接校验,对明显错误快速失败
  const link = parseFeishuUrl(url)
  onProgress(`解析链接:${link.kind}/${link.token}`)

  const creds = await loadFeishuCredentials()
  const client = new FeishuClient(creds.appId, creds.appSecret, creds.baseUrl)

  // wiki → docx
  let documentId: string
  let wikiToken: string | undefined
  if (link.kind === 'wiki') {
    wikiToken = link.token
    const node = await client.resolveWikiNode(link.token)
    if (node.objType !== 'docx') {
      throw new Error(
        `wiki 节点指向的是 ${node.objType},当前仅支持 docx 类型文档。`,
      )
    }
    documentId = node.objToken
    onProgress(`wiki 节点解析 → docx document_id=${documentId}`)
  } else {
    documentId = link.token
  }

  // 标题 + 正文 + blocks
  const [{ title }, content, blocks] = await Promise.all([
    client.getDocumentMeta(documentId),
    client.getRawContent(documentId),
    client.getAllBlocks(documentId),
  ])
  onProgress(`拉到正文 ${content.length} 字、blocks ${blocks.length} 个:《${title}》`)

  // 落盘目录
  const specDir = path.join(VEGA_DIR, 'specs', documentId)
  const assetsDir = path.join(specDir, 'assets')
  await fs.mkdir(assetsDir, { recursive: true })

  // 下载图片
  const imageBlocks = collectImageBlocks(blocks)
  onProgress(`发现图片 ${imageBlocks.length} 张,开始下载…`)
  const assets: SpecAsset[] = []
  let totalBytes = 0
  for (const [i, img] of imageBlocks.entries()) {
    const { bytes, contentType } = await client.downloadMedia(img.fileToken)
    const file = `assets/${img.fileToken}.${extFromContentType(contentType)}`
    await fs.writeFile(path.join(specDir, file), bytes)
    assets.push({ fileToken: img.fileToken, file, blockId: img.blockId })
    totalBytes += bytes.length
    onProgress(`图片 ${i + 1}/${imageBlocks.length} ↓ ${file}`)
  }

  // 写正文 + blocks + manifest
  await fs.writeFile(path.join(specDir, 'document.md'), content, 'utf8')
  await fs.writeFile(
    path.join(specDir, 'blocks.json'),
    JSON.stringify(blocks, null, 2),
    'utf8',
  )

  const manifest: SpecManifest = {
    source: { url, kind: link.kind, wikiToken, documentId },
    title,
    fetchedAt: new Date().toISOString(),
    document: 'document.md',
    blocks: 'blocks.json',
    assets,
    counts: { blocks: blocks.length, images: assets.length, bytes: totalBytes },
    structured: null,
  }
  await fs.writeFile(
    path.join(specDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )

  onProgress(`落盘完成 → ${specDir}`)
  return { specDir, manifest }
}
