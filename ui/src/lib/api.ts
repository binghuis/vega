/** 与 vega server 的契约(镜像后端 SpecManifest 等类型)+ 取数封装。 */

export interface SpecAsset {
  fileToken: string
  file: string
  blockId: string
}

export interface SpecManifest {
  source: {
    url: string
    kind: 'docx' | 'wiki'
    wikiToken?: string
    documentId: string
  }
  title: string
  fetchedAt: string
  document: string
  blocks: string
  assets: SpecAsset[]
  counts: { blocks: number; images: number; bytes: number }
  structured: null
}

export interface FeishuConfigState {
  appId: string
  hasSecret: boolean
  baseUrl: string
  ready: boolean
}

export interface FeishuConfigPatch {
  appId?: string
  appSecret?: string
  baseUrl?: string
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `请求失败(HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const api = {
  getFeishuConfig: () =>
    fetch('/api/config/feishu').then(unwrap<FeishuConfigState>),

  saveFeishuConfig: (patch: FeishuConfigPatch) =>
    postJson('/api/config/feishu', patch).then(unwrap<FeishuConfigState>),

  parse: (url: string) =>
    postJson('/api/specs/parse', { url }).then(
      unwrap<{ specId: string; manifest: SpecManifest }>,
    ),

  listSpecs: () => fetch('/api/specs').then(unwrap<SpecManifest[]>),

  getDocument: (id: string) =>
    fetch(`/api/specs/${id}/document`).then((r) => {
      if (!r.ok) throw new Error(`正文加载失败(HTTP ${r.status})`)
      return r.text()
    }),

  /** 素材直链(endpoint 只认文件名,去掉 assets/ 前缀) */
  assetUrl: (id: string, file: string) =>
    `/api/specs/${id}/assets/${file.split('/').pop() ?? file}`,
}
