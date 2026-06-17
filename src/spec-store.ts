/**
 * 已落盘需求(.vega/specs/<documentId>/)的只读访问。
 * 给 server 列出/读取解析产物用;不发网络。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

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

/** 正文 markdown 文本;不存在返回 null */
export async function getDocument(id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(SPECS_DIR, id, 'document.md'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
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

/**
 * 解析素材文件的绝对路径。
 * 只取 basename 防目录穿越,且必须落在该 spec 的 assets 目录内。
 */
export function resolveAssetPath(id: string, file: string): string {
  const safe = path.basename(file)
  return path.join(SPECS_DIR, id, 'assets', safe)
}
