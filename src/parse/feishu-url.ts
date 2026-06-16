/**
 * 解析飞书文档链接 → 文档标识。
 *
 * 三种常见形态(host 可能是 xxx.feishu.cn / xxx.larksuite.com / 企业自定义域):
 *   /docx/<token>   新版文档,token 即 document_id,可直接取内容
 *   /wiki/<token>   知识库节点,需再经 wiki API 解析出 obj_token(通常是 docx)
 *   /docs/<token>   旧版文档(doc),内容接口不同,当前未支持
 *
 * 只做纯解析(确定性),不发网络请求;wiki → docx 的解析在 feishu 客户端里做。
 */

/** 解析结果:仅新版 docx 与知识库 wiki 两种合法形态 */
export type FeishuLink =
  | { kind: 'docx'; token: string }
  | { kind: 'wiki'; token: string }

/** 路径里可识别的文档类型关键字('docs' 是旧版,识别到即报错) */
const DOC_SEGMENTS = new Set(['docx', 'wiki', 'docs'])

export function parseFeishuUrl(input: string): FeishuLink {
  const trimmed = input.trim()

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`不是合法的链接:${trimmed}`)
  }

  // 路径段,去掉空段(开头/结尾的斜杠)
  const segments = url.pathname.split('/').filter(Boolean)

  // 找到 docx/wiki/docs 关键字,token 取其后一段
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    if (!DOC_SEGMENTS.has(seg)) continue
    const token = segments[i + 1]!
    if (!token) break
    if (seg === 'docs') {
      throw new Error(
        `检测到旧版文档链接(/docs/),当前仅支持新版 docx 与 wiki。` +
          `请在飞书里用「新版文档」或知识库(wiki)链接。`,
      )
    }
    return { kind: seg as 'docx' | 'wiki', token }
  }

  throw new Error(
    `无法从链接识别文档:${trimmed}。期望形如 .../docx/<token> 或 .../wiki/<token>。`,
  )
}
