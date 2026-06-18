# 织女 UI 范式

对齐 Claude Design 设计系统(claude.ai/design「织女 Vega · Design System」)。改 UI 一律遵守,评审对照本表。源真理在 [src/index.css](src/index.css) 的 token。

## 1. 颜色:只用 token,禁裸调色板

**严禁**硬编码 `emerald-*` / `amber-*` / `red-*` / `slate-*` 等原始调色板。一切走 token。

**表面色阶**(扁平,靠明度差分层,**不用投影**):

| token | 用途 |
| --- | --- |
| `bg-background` | app 画布(0.995,近纯白) |
| `bg-soft` | **内容卡原语**:平铺软填充(0.965)——所有内容卡用它,不加 shadow |
| `bg-soft-alert` | 软填充 + 暖调(待澄清卡) |
| `bg-card` | 抬升 / 输入面(纯白) |
| `bg-faint` | chrome 带(顶栏 / peek 第三栏) |
| `bg-muted` | chip / tag / 分段控件底 |
| `border` / `border-hairline` | 结构边 / 卡内细分隔 |

**语义色**(低彩度克制,light/dark 各一套,dark 提亮):

| 语义 | token | 用途 |
| --- | --- | --- |
| brand | `--brand` / `text-brand` / `bg-brand/…` | 织女靛蓝:主操作、链接、选中、溯源高亮 |
| success | `--success` / `text-success` / Badge `variant="success"` | 确定 |
| warning | `--warning` / `text-warning` / Badge `variant="warning"` | 默认 / 待复核 |
| destructive | `--destructive` / `text-destructive` / Badge `variant="destructive"` | 待澄清 / 错误 / 危险动作 |

> 状态用**色点 + 文字**(组头),不在每张卡重复状态徽章。新增语义色:`:root`+`.dark` 加 `--x`(dark 提亮),`@theme inline` 注册 `--color-x`。

## 2. 字体

- `font-sans`(DM Sans)= UI 默认;`font-serif`(Fraunces)= 区块标题 / wordmark 的 Vega;`font-cjk`(Noto Serif SC,已打包)= 「织女」+ CJK 衬线;`font-mono` = 溯源行号 / 代码。
- 助手类 `.serif` / `.cjk` / `.mono` 可直接用。

## 3. 圆角:分级

`rounded-app`(18)外框 · `rounded-panel`(14)· `rounded-card`(12,= shadcn `rounded-lg`)· `rounded-control`(9)输入/按钮 · `rounded-chip`(7)· `rounded-pill`(6)。别用裸 `rounded`。

## 4. Markdown:用 `.md` 作用域

渲染 Markdown 的容器套 `.md`(见 index.css):衬线标题、品牌色列表点、任务清单、表格、引用、代码块全包了。别另写一套。

## 5. 信息架构:源 → 产物

- **外壳**:全屏铺满 — 顶栏(faint)+ 左栏「源」+ 工作区 +(可选)溯源 peek 第三栏。
- **左栏 = 源**:飞书配置 / 解析 / 已解析需求列表。
- **工作区 navrow**:`源(正文 / 图片)` 与 `产物(结构化)` 两组分段控件。
- **结构化**:准则**按状态分组**(待澄清 / 确定 / 默认),组头色点 + 衬线小标题;每条可点「溯源 Lxx」→ 第三栏锚回原文行。
- 生成设计 / 评审等阶段属未来后端能力,**未做**——不要加无后端支撑的入口。
