/**
 * 已落盘需求(.vega/specs/<documentId>/)的只读访问。
 * 给 server 列出/读取解析产物用;不发网络。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { blocksToMarkdown, type DocxBlock } from './parse/blocks-to-markdown'
import { VEGA_DIR } from './config'
import type { SpecManifest } from './parse/feishu'

const SPECS_DIR = path.join(VEGA_DIR, 'specs')

async function readManifest(id: string): Promise<SpecManifest | null> {
  try {
    const raw = await fs.readFile(
      path.join(SPECS_DIR, id, 'manifest.json'),
      'utf8',
    )
    return JSON.parse(raw) as SpecManifest
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** 列出所有已解析需求(按抓取时间倒序) */
export async function listSpecs(): Promise<SpecManifest[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(SPECS_DIR)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const manifests = (await Promise.all(entries.map(readManifest))).filter(
    (m): m is SpecManifest => m !== null,
  )
  return manifests.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
}

export function getManifest(id: string): Promise<SpecManifest | null> {
  return readManifest(id)
}

/**
 * 正文(由 blocks.json 还原格式后的 Markdown);blocks.json 不存在返回 null。
 * 保留标题 / 列表 / 表格 / 图片(对比 raw_content 接口只给纯文本、丢格式)。
 */
export async function getDocumentMarkdown(id: string): Promise<string | null> {
  let raw: string
  try {
    raw = await fs.readFile(path.join(SPECS_DIR, id, 'blocks.json'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return blocksToMarkdown(JSON.parse(raw) as DocxBlock[])
}

/** 结构化结果(structured.json);未结构化返回 null */
export async function getStructured(id: string): Promise<unknown | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(SPECS_DIR, id, 'structured.json'), 'utf8'),
    )
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** structured.json 里一条待澄清(只取本文件关心的字段) */
interface StoredClarification {
  id: string
  answer?: string | null
}

/**
 * 记录某条待澄清的答案(A/B 之一或「其他」自定义文本;null=清除),写回 structured.json。
 * 返回更新后的该条;structured.json 不存在或找不到该 id 时返回 null。
 */
export async function setClarificationAnswer(
  id: string,
  clarificationId: string,
  answer: string | null,
): Promise<StoredClarification | null> {
  const file = path.join(SPECS_DIR, id, 'structured.json')
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  const data = JSON.parse(raw) as { clarifications?: StoredClarification[] }
  const target = data.clarifications?.find((q) => q.id === clarificationId)
  if (!target) return null
  target.answer = answer
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
  return target
}

/**
 * 解析素材文件的绝对路径。
 * 只取 basename 防目录穿越,且必须落在该 spec 的 assets 目录内。
 */
export function resolveAssetPath(id: string, file: string): string {
  const safe = path.basename(file)
  return path.join(SPECS_DIR, id, 'assets', safe)
}
