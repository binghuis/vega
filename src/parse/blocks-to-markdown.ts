/**
 * 飞书 docx 全量 blocks(blocks.json)→ Markdown(GFM)。
 *
 * 纯函数、确定性,与 feishu.ts 的解析同源:raw_content 接口只给纯文本、丢格式,
 * 这里从结构化 blocks 还原标题 / 列表(含多级)/ 表格 / 图片 / 行内样式。
 * 图片输出 ![](<fileToken>),token 即 manifest.assets[].fileToken,由前端按 manifest
 * 换成素材直链(见 ui SpecMarkdown);converter 本身不关心服务路径。
 *
 * 已知取舍:
 * - 表格首行当表头(GFM 语法要求表头行);合并单元格(merge_info)不还原,按平铺处理。
 * - 单元格内容输出原始 HTML(<ol>/<li> 等):GFM 表格单元格放不下块级 Markdown 列表,
 *   故嵌套列表在单元格内用 HTML 表达,依赖渲染端开启 rehype-raw(+ rehype-sanitize)。
 * - 分栏(grid / grid_column)Markdown 无法表达,按列顺序纵向堆叠。
 * - 代码块语言(numeric enum)不映射,输出无语言标注的围栏。
 */

/** docx 行内元素(只取用到的字段) */
interface DocxElement {
  text_run?: {
    content: string
    text_element_style?: {
      bold?: boolean
      italic?: boolean
      strikethrough?: boolean
      inline_code?: boolean
    }
    link?: { url?: string }
  }
}

/** docx block(只声明用到的字段,其余键透传) */
export interface DocxBlock {
  block_id: string
  block_type: number
  children?: string[]
  /** 文字类块把行内元素放在与类型同名的字段里 */
  text?: { elements: DocxElement[] }
  bullet?: { elements: DocxElement[] }
  ordered?: { elements: DocxElement[]; style?: { sequence?: string } }
  quote?: { elements: DocxElement[] }
  todo?: { elements: DocxElement[]; style?: { done?: boolean } }
  code?: { elements: DocxElement[] }
  image?: { token: string }
  table?: {
    cells: string[]
    property?: { column_size?: number }
  }
  /** heading1..heading9 等动态键 */
  [k: string]: unknown
}

const PAGE = 1
const TEXT = 2
const HEADING_MIN = 3 // heading1
const HEADING_MAX = 11 // heading9
const BULLET = 12
const ORDERED = 13
const CODE = 14
const QUOTE = 15
const TODO = 17
const GRID = 24
const GRID_COLUMN = 25
const IMAGE = 27
const DIVIDER = 22
const TABLE = 31

/** 块间空行;一个列表项的嵌套内容缩进一级 */
const NEST_INDENT = '    '

/** 有序列表序号:显式数字设定起点,"auto"/缺省在前值上 +1 */
function nextOrdinal(seq: string | undefined, prev: number): number {
  return seq && /^\d+$/.test(seq) ? Number(seq) : prev + 1
}

function hasElements(v: unknown): v is { elements: DocxElement[] } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'elements' in v &&
    Array.isArray((v as { elements: unknown }).elements)
  )
}

/** 取块的行内元素(文字 / 列表 / 标题等通用) */
function elementsOf(b: DocxBlock): DocxElement[] {
  const direct = b.text ?? b.ordered ?? b.bullet ?? b.quote ?? b.todo ?? b.code
  if (direct) return direct.elements
  const level = b.block_type - 2 // heading{level}
  if (level >= 1 && level <= 9) {
    const h = b[`heading${level}`]
    if (hasElements(h)) return h.elements
  }
  return []
}

/** 行内元素 → Markdown(加粗 / 斜体 / 删除线 / 行内代码 / 链接) */
function renderInline(elements: DocxElement[]): string {
  return elements
    .map((el) => {
      const run = el.text_run
      if (!run) return ''
      const style = run.text_element_style ?? {}
      // 行内代码内部不再叠加其它样式,内容原样
      if (style.inline_code) return '`' + run.content + '`'
      let text = run.content
      if (style.bold) text = `**${text}**`
      if (style.italic) text = `*${text}*`
      if (style.strikethrough) text = `~~${text}~~`
      if (run.link?.url) {
        // 飞书 link.url 为百分号编码,尽量还原可读形式
        let href = run.link.url
        try {
          href = decodeURIComponent(href)
        } catch {
          /* 非法编码,保持原值 */
        }
        text = `[${text}](${href})`
      }
      return text
    })
    .join('')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

/**
 * 行内元素 → HTML(单元格专用)。
 * GFM 表格单元格放不下块级 Markdown 列表,故单元格内容整体走原始 HTML(见 renderCell);
 * rehype-raw 重解析的是 HTML 而非 Markdown,所以这里行内样式也必须用 HTML 标签、文本需转义。
 */
function renderInlineHtml(elements: DocxElement[]): string {
  return elements
    .map((el) => {
      const run = el.text_run
      if (!run) return ''
      const style = run.text_element_style ?? {}
      if (style.inline_code) return `<code>${escapeHtml(run.content)}</code>`
      let text = escapeHtml(run.content)
      if (style.bold) text = `<strong>${text}</strong>`
      if (style.italic) text = `<em>${text}</em>`
      if (style.strikethrough) text = `<del>${text}</del>`
      if (run.link?.url) {
        let href = run.link.url
        try {
          href = decodeURIComponent(href)
        } catch {
          /* 非法编码,保持原值 */
        }
        text = `<a href="${escapeAttr(href)}">${text}</a>`
      }
      return text
    })
    .join('')
}

/**
 * 单元格内子块(按文档序)→ HTML。连续同型列表项聚成一个 <ol>/<ul>,
 * 子块递归成嵌套列表;序号由浏览器渲染(不抄飞书的 sequence,避免出现 2 起头之类)。
 * 普通文字/图片各成一段,段间用 <br> 连接。
 */
function renderCellNodes(ids: string[], byId: Map<string, DocxBlock>): string {
  const segs: string[] = []
  let i = 0
  while (i < ids.length) {
    const b = byId.get(ids[i]!)
    if (!b) {
      i++
      continue
    }
    const type = b.block_type
    if (type === ORDERED || type === BULLET) {
      const tag = type === ORDERED ? 'ol' : 'ul'
      const items: string[] = []
      let start = 1
      // 吃掉连续的同型列表项,合成一个列表
      while (i < ids.length) {
        const li = byId.get(ids[i]!)
        if (!li || li.block_type !== type) break
        // 首项的显式序号即列表起点(飞书会尊重它,如 sequence='2' 起于 2/ii)
        if (items.length === 0 && type === ORDERED) {
          const seq = li.ordered?.style?.sequence
          if (seq && /^\d+$/.test(seq)) start = Number(seq)
        }
        const inner = renderInlineHtml(elementsOf(li))
        const nested = li.children?.length
          ? renderCellNodes(li.children, byId)
          : ''
        items.push(`<li>${inner}${nested}</li>`)
        i++
      }
      const startAttr = tag === 'ol' && start > 1 ? ` start="${start}"` : ''
      segs.push(`<${tag}${startAttr}>${items.join('')}</${tag}>`)
    } else if (b.image?.token) {
      segs.push(`<img src="${escapeAttr(b.image.token)}" alt="">`)
      i++
    } else {
      const inner = renderInlineHtml(elementsOf(b))
      const nested = b.children?.length ? renderCellNodes(b.children, byId) : ''
      if (inner || nested) segs.push(inner + nested)
      i++
    }
  }
  return segs.join('<br>')
}

/**
 * 单元格内容 → HTML 片段;转义竖线避免破坏所在 GFM 表格行的列切分。
 * 输出含 <ol>/<li> 等块级 HTML,依赖渲染端开启 rehype-raw(见 ui SpecMarkdown)。
 */
function renderCell(cellId: string, byId: Map<string, DocxBlock>): string {
  const cell = byId.get(cellId)
  if (!cell?.children) return ''
  return renderCellNodes(cell.children, byId).replace(/\|/g, '\\|')
}

/** 表格 → GFM(首行作表头) */
function renderTable(b: DocxBlock, byId: Map<string, DocxBlock>): string {
  const cells = b.table?.cells ?? []
  const cols = b.table?.property?.column_size ?? 0
  if (cols <= 0 || cells.length === 0) return ''
  const rows: string[][] = []
  for (let i = 0; i < cells.length; i += cols) {
    const row = cells.slice(i, i + cols).map((id) => renderCell(id, byId) || ' ')
    while (row.length < cols) row.push(' ')
    rows.push(row)
  }
  const toLine = (r: string[]) => `| ${r.join(' | ')} |`
  const head = rows[0]!
  const sep = head.map(() => '---')
  return [toLine(head), toLine(sep), ...rows.slice(1).map(toLine)].join('\n')
}

/** 单块(含其后代)→ Markdown。ordinal 为有序列表项的实际序号(由调用方按兄弟顺序算) */
function renderBlock(
  b: DocxBlock,
  byId: Map<string, DocxBlock>,
  indent: string,
  ordinal: number,
): string {
  const type = b.block_type

  // 容器类:页面 / 分栏直接铺开子块
  if (type === PAGE || type === GRID || type === GRID_COLUMN) {
    return renderChildren(b.children ?? [], byId, indent)
  }
  if (type === TABLE) return renderTable(b, byId)
  if (type === DIVIDER) return `${indent}---`
  if (type === IMAGE) {
    return b.image?.token ? `${indent}![](${b.image.token})` : ''
  }
  if (type >= HEADING_MIN && type <= HEADING_MAX) {
    return `${'#'.repeat(type - 2)} ${renderInline(elementsOf(b))}`
  }
  if (type === CODE) {
    const code = b.code?.elements.map((e) => e.text_run?.content ?? '').join('') ?? ''
    return '```\n' + code + '\n```'
  }

  // 行内类:文字 / 列表项 / 引用 / 待办
  let self: string
  const inline = renderInline(elementsOf(b))
  if (type === ORDERED) {
    self = `${indent}${ordinal}. ${inline}`
  } else if (type === BULLET) {
    self = `${indent}- ${inline}`
  } else if (type === TODO) {
    self = `${indent}${b.todo?.style?.done ? '- [x]' : '- [ ]'} ${inline}`
  } else if (type === QUOTE) {
    self = `${indent}> ${inline}`
  } else if (type === TEXT) {
    self = inline ? `${indent}${inline}` : ''
  } else {
    // 未知类型:有文字则保底输出,否则丢弃
    self = inline ? `${indent}${inline}` : ''
  }

  // 嵌套子块(多级列表、列表项内的图片等)缩进一级接在后面
  const childMd = renderChildren(b.children ?? [], byId, indent + NEST_INDENT)
  if (childMd) self = self ? `${self}\n\n${childMd}` : childMd
  return self
}

/**
 * 一组兄弟块,空块跳过,块间空一行。
 * 有序列表序号在此按兄弟顺序连续计算:显式数字(如 "1")设定起点,
 * "auto" 在前值上 +1,被非有序块打断则归零。
 */
function renderChildren(
  ids: string[],
  byId: Map<string, DocxBlock>,
  indent: string,
): string {
  const parts: string[] = []
  let ordinal = 0
  for (const id of ids) {
    const b = byId.get(id)
    if (!b) continue
    ordinal =
      b.block_type === ORDERED
        ? nextOrdinal(b.ordered?.style?.sequence, ordinal)
        : 0
    const md = renderBlock(b, byId, indent, ordinal)
    if (md.trim()) parts.push(md)
  }
  return parts.join('\n\n')
}

/**
 * blocks(扁平数组,经 children 串成树)→ Markdown。
 * 从 page 根块(block_type === 1)起遍历;无根块时退化为按数组顺序铺开。
 */
export function blocksToMarkdown(blocks: DocxBlock[]): string {
  const byId = new Map(blocks.map((b) => [b.block_id, b]))
  const root = blocks.find((b) => b.block_type === PAGE)
  const md = root
    ? renderChildren(root.children ?? [], byId, '')
    : renderChildren(
        blocks.map((b) => b.block_id),
        byId,
        '',
      )
  return md.trimEnd() + '\n'
}
