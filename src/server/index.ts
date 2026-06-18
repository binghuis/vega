/**
 * vega 本地 server —— 引擎与网页 UI 的桥。
 *
 * 只暴露三类能力:
 *   1. 飞书凭据配置(网页里填 → 落 .vega/config.json)
 *   2. 触发解析(粘链接 → 解析落盘 → 返回 manifest)
 *   3. 读取已落盘需求(列表 / 正文 / 图片)
 *
 * 当前到「飞书解析落盘」为止,不含需求结构化。
 */
import { readFile } from 'node:fs/promises'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { readFeishuConfigState, saveFeishuCredentials } from '../config'
import { parseFeishuDoc } from '../parse/feishu'
import {
  getDocumentMarkdown,
  getManifest,
  getStructured,
  listSpecs,
  resolveAssetPath,
  setClarificationAnswer,
} from '../spec-store'
import { structureSpec } from '../structure/structure'

function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* 无 .env,忽略 */
  }
}

const ASSET_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const app = new Hono()

// 开发期 UI 跑在 Vite(5173),与 server 不同源,放开 CORS;生产同源时无影响
app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true }))

// —— 飞书凭据配置 ——
app.get('/api/config/feishu', async (c) => {
  return c.json(await readFeishuConfigState())
})

app.post('/api/config/feishu', async (c) => {
  const body = await c.req.json<{
    appId?: string
    appSecret?: string
    baseUrl?: string
  }>()
  await saveFeishuCredentials({
    ...(body.appId !== undefined ? { appId: body.appId } : {}),
    ...(body.appSecret !== undefined ? { appSecret: body.appSecret } : {}),
    ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
  })
  return c.json(await readFeishuConfigState())
})

// —— 解析 ——
app.post('/api/specs/parse', async (c) => {
  const { url } = await c.req.json<{ url?: string }>()
  if (!url) return c.json({ error: '缺少 url' }, 400)
  try {
    const { manifest } = await parseFeishuDoc(url)
    return c.json({ specId: manifest.source.documentId, manifest })
  } catch (e) {
    return c.json({ error: errMessage(e) }, 400)
  }
})

// —— 已落盘需求 ——
app.get('/api/specs', async (c) => c.json(await listSpecs()))

app.get('/api/specs/:id', async (c) => {
  const m = await getManifest(c.req.param('id'))
  return m ? c.json(m) : c.json({ error: 'not found' }, 404)
})

// 正文(blocks 还原格式后的 Markdown,供网页带格式渲染)
app.get('/api/specs/:id/markdown', async (c) => {
  const md = await getDocumentMarkdown(c.req.param('id'))
  if (md === null) return c.json({ error: 'not found' }, 404)
  return c.text(md)
})

// —— 需求结构化 ——
app.get('/api/specs/:id/structured', async (c) => {
  const data = await getStructured(c.req.param('id'))
  return data ? c.json(data) : c.json({ error: 'not structured yet' }, 404)
})

app.post('/api/specs/:id/structure', async (c) => {
  try {
    const { summary } = await structureSpec(c.req.param('id'))
    return c.json(summary)
  } catch (e) {
    return c.json({ error: errMessage(e) }, 400)
  }
})

// 记录某条待澄清的答案(A/B 或「其他」自定义文本;null=清除)
app.post('/api/specs/:id/clarifications/:cid/answer', async (c) => {
  const body = await c.req.json<{ answer?: string | null }>()
  const answer = typeof body.answer === 'string' ? body.answer : null
  const updated = await setClarificationAnswer(
    c.req.param('id'),
    c.req.param('cid'),
    answer,
  )
  return updated ? c.json(updated) : c.json({ error: 'not found' }, 404)
})

app.get('/api/specs/:id/assets/:file', async (c) => {
  const file = c.req.param('file')
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  try {
    const bytes = await readFile(resolveAssetPath(c.req.param('id'), file))
    return c.body(bytes, 200, {
      'Content-Type': ASSET_CONTENT_TYPE[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    })
  } catch {
    return c.json({ error: 'not found' }, 404)
  }
})

loadDotEnv()
const port = Number(process.env.VEGA_PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`vega server → http://localhost:${port}`)
