import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

interface Props {
  markdown: string
  /** 图片 token(Markdown 里 ![](token) 的 token)→ 素材直链;无映射返回 null */
  resolveImage: (token: string) => string | null
}

/**
 * 安全白名单:在 rehype-sanitize 默认 schema 基础上放行单元格用到的块级 HTML。
 * converter 在表格单元格里输出 <ol>/<li>/<br> 等原始 HTML(GFM 单元格放不下块级列表,
 * 见 blocks-to-markdown);rehype-raw 重解析后由此 schema 过滤,挡掉 <script>/onerror 等。
 * 图片 src 是飞书裸 fileToken(无协议=相对地址),默认 schema 放行,再由 components.img 换直链。
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'ol',
    'ul',
    'li',
    'br',
    'strong',
    'em',
    'del',
    'code',
    'a',
    'img',
  ],
  attributes: {
    ...defaultSchema.attributes,
    // <ol start="N"> 还原飞书的列表起始序号(如 sequence='2' → start=2 → ii)
    ol: [...(defaultSchema.attributes?.ol ?? []), 'start'],
  },
}

/**
 * 渲染由 blocks 还原的正文 Markdown(GFM:表格、删除线等),元素用浏览器默认样式。
 * 唯一的 components 覆写是 img:把飞书 fileToken 经 resolveImage 换成后端素材直链(功能,非样式)。
 */
export function SpecMarkdown({ markdown, resolveImage }: Props) {
  const components: Components = {
    img: ({ src, alt }) => {
      const url = typeof src === 'string' ? resolveImage(src) : null
      if (!url) return null
      return <img src={url} alt={alt ?? ''} loading="lazy" />
    },
  }

  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  )
}
