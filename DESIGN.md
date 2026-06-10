<div align="center">

# ✦ Vega · 织女 — 系统设计

**一台验证引擎,顺便生成代码。**

</div>

---

> 本文从第一性原理推导织女的架构。读法:每个架构决策后面都标了它出自哪条公理(`⟸ 公理N`)。如果某个决策找不到公理来源,它就不该存在。

---

## §0 核心命题

大多数"自动写代码"系统是 **以生成为中心、把验证当末端工序**。织女反过来:

> **织女不是"会写代码的生成器 + 测试",而是一台验证引擎 —— 它顺便生成代码,去满足一份可执行的视觉 + 行为契约。生成器可替换,契约和神谕(oracle)才是产品。**

这个反转是整篇设计的根:**无人值守系统的全部价值,是"你不看着它也敢信"。这份信任只来自验证。** 所以织女围绕"验证"组织架构,而不是围绕"生成"。

---

## §1 第一性原理(公理)

| # | 公理 | 推论 |
|---|------|------|
| **1** | LLM 是有界上下文、无基准真相的随机函数 —— 会幻觉、会漂移、长程失稳。 | 单点输出不可信;长任务必须切成**短的、可独立验证**的单元;context 不可无界累积。 |
| **2** | 瓶颈是**验证**不是生成。生成在变无限便宜,"知道它对不对"才难。 | 系统**围绕验证组织架构**。无神谕的产物 = 不可信的产物。 |
| **3** | 真相分三种且强弱悬殊:**Figma = 视觉真相(唯一可机器执行/比对的规格)** > 编译器 = 正确性真相 > 需求文档 = 语义真相(最弱,有歧义、不可机检)。 | **最大化依赖 Figma 作为可执行真相,最小化依赖自然语言需求。** |
| **4** | 错误向下游复利:拆解错了上面全错(致命且便宜改),叶子错了便宜。 | 把不成比例的验证火力压在**最上游(契约)**;唯一人工卡点放在契约上,不放在代码上。 |
| **5** | 单元 = 生成单元 = 验证单元 = 交付单元,三者必须重合。自然原子是**一个屏幕 / 一个 Figma frame / 一条路由**。 | 并行、验证、降级全部对齐到同一条边界。组件库(tokens + 共享组件)拓扑上天然先于屏幕。 |
| **6** | **视觉 diff 是本领域独有、信号最高的客观神谕。**"这块区域偏了多少"远比测试栈回溯精确。 | 视觉比对是**主验收门**,不是附属功能。 |

---

## §2 架构总览

四个阶段,对应 README 的 **抽丝 → 织造 → 验布 → 交付**:

```
┌─ 阶段0  抽丝 · 契约抽取(最重要)──────────────────────────────────  ⟸ 公理3,4
│   Figma  ──最大化抽取──►  tokens · 组件清单 · 每frame布局规格 · 导出基准图
│   需求    ──仅见spec的agent──►  每屏「冻结的行为判据」(实现前定死,防自证循环)
│   reconcile:每屏须同时有 视觉契约(frame) + 行为契约(判据);缺口在此暴露
│   ▼
│   对抗审查(adversarial gate)── 契约完整性 + 需求↔设计一致性
│   产物:contract/ = 全系统唯一真相,冻结
│        ⏸ 唯一人工卡点(可配置自动放行)→ 批准契约,然后去睡
└──────────────────────────────┬───────────────────────────────────
                               ▼
┌─ 阶段1  设计系统先行(拓扑强制)──────────────────────────────────  ⟸ 公理5
│   tokens + 组件清单 → 每个共享组件在隔离环境里 视觉diff 验证
│   一次做对、全局复用;屏幕依赖它,故先建
└──────────────────────────────┬───────────────────────────────────
                               ▼
┌─ 阶段2  每屏闭环(系统的分形单元,各自独立worktree,大规模并行)───────  ⟸ 公理1,2,5,6
│   生成屏幕 → ① 编译神谕(typecheck/lint,最便宜先跑)
│           → ② 视觉神谕(截图 ⨯ Figma基准 → pixelmatch + 视觉判官)
│           → ③ 行为神谕(冻结判据 ⨯ 运行中应用,黑盒)
│   任一门红:把「神谕差量」本身当修复输入 → 同线程修复 → 重跑
│   全绿 → commit;预算/重试耗尽 → 降级并记录证据
└──────────────────────────────┬───────────────────────────────────
                               ▼
┌─ 阶段3  集成与交付────────────────────────────────────────────────  ⟸ 公理2
│   组装路由+导航 → 跨屏流程校验
│   产出:可运行项目 + 「证据型验收报告」(每屏 Figma vs 实际 并排 + 判据表 + 诚实缺口清单)
└──────────────────────────────────────────────────────────────────
```

**最关键的一步**(⟸ 公理2,6):喂给修复的是**「验证的差量本身」**,不是对需求的复述。视觉 diff 说"这块区域偏了多少",这是物理上能给出的最高信号修正。

---

## §3 契约:唯一真相

契约是整个系统的脊柱。两个模糊输入(自然语言需求 + 设计稿)在阶段0 被熔成**一份机器可校验的契约**,之后全系统只认它。

### 3.1 目录布局

```
contract/
├── manifest.json          ← 索引:屏幕清单 · 依赖图 · 技术栈profile引用
├── tokens.json            ← 设计令牌(色/间距/字号/圆角/阴影/断点)
├── components.json         ← 共享组件清单(设计系统)
├── screens/
│   ├── home.json          ← 单屏契约(见 3.3)
│   └── detail.json
└── refs/                  ← Figma 导出基准图(视觉神谕的比对标的)
    ├── home@default.png
    ├── home@empty.png
    ├── home@loading.png
    └── detail@default.png
```

### 3.2 设计令牌与组件(从 Figma 抽取)

```typescript
interface DesignTokens {
  colors: Record<string, string>          // semantic name → value
  spacing: number[]                        // 间距阶梯
  typography: Record<string, { size: number; weight: number; lineHeight: number; family: string }>
  radii: Record<string, number>
  shadows: Record<string, string>
  breakpoints: Record<string, number>
}

interface ComponentSpec {
  name: string
  figma_node: string                       // 溯源到 Figma 节点
  variants: string[]                        // 如 primary/secondary/danger
  states: Array<'default' | 'hover' | 'active' | 'disabled' | 'loading'>
  props: Array<{ name: string; type: string; required: boolean }>
  ref_image: string                         // 隔离视觉比对的基准图
}
```

### 3.3 单屏契约(系统原子)

每屏同时携带**视觉契约**、**行为契约**、**接口契约** —— 三种神谕各取所需(⟸ 公理2,5,6):

```typescript
interface ScreenContract {
  name: string
  route: string
  fsd_path: string                          // 由 profile 决定的落地路径
  figma_node: string

  // —— 视觉契约(视觉神谕用)——
  visual: {
    ref_default: string                     // 默认态基准图
    states: Array<{ name: 'empty'|'loading'|'error'|'permission'; ref_image: string }>
    layout_hints: string[]                  // 结构化布局提示(辅助,基准图才是真相)
  }

  // —— 行为契约:冻结判据(行为神谕用,实现前定死)—— ⟸ 公理1,4
  criteria: Array<{
    id: string
    statement: string                       // "点击新建按钮 → 弹出创建弹窗"
    given?: string; when: string; then: string   // 可机检的 given/when/then
  }>

  // —— 接口契约(MSW mock + 行为神谕用)——
  apis: Array<{
    method: 'GET'|'POST'|'PUT'|'DELETE'
    path: string
    request_shape?: string
    response_shape: string                  // 推导 mock 数据
  }>

  depends_on: { components: string[]; screens: string[] }  // 拓扑排序用
}
```

**为什么判据要在实现前冻结、且由"只看 spec"的 agent 产出**(⟸ 公理1):若测试与代码由同一份理解生成,测试会继承代码的误解 —— **自证循环**,系统会自信地交付"自洽地错"的东西。冻结判据 + 黑盒执行,斩断这个循环。

---

## §4 神谕系统(Oracle)—— 系统的心脏

**公理2 的直接落地:每个产物都必须被机械地对照真相校验。** 织女有三个**相互独立**的神谕,按成本从低到高排门:

### ① 编译神谕(compile oracle)

最便宜,先跑。`tsc --noEmit` + lint。通过 = 代码良构。机械、确定性,无 LLM。

### ② 视觉神谕(visual oracle)—— 织女的灵魂(⟸ 公理6)

输入:运行中应用的**截图** ⨯ Figma **导出基准图**。**两层判定**(解决像素 diff 的脆性):

```
截图 ──► [第一层] pixelmatch 像素/感知 diff
          │  定位「哪里」偏 + 偏差比例
          ├─ 差异 < 阈值 ───────────────────────► PASS
          └─ 差异 ≥ 阈值 ──► [第二层] 视觉判官(LLM-vision)
                              判「这偏差要不要紧」(语义保真度)
                              兜住:抗锯齿/字体渲染/动态内容 的假阳性
                              │
                              ├─ 语义等价 ──► PASS(记录可忽略差异)
                              └─ 真实偏差 ──► FAIL + 偏差区域图 + 文字描述
```

- **第一层(pixelmatch)** 回答**「哪里」**:输出 diff 区域图,定位精确。
- **第二层(视觉判官)** 回答**「要不要紧」**:判语义保真度,而非逐像素相等。
- FAIL 时输出的 **`diff 区域图 + 文字偏差描述`** 直接作为修复输入 —— 物理上最高信号的修正(⟸ 公理2)。

```typescript
interface VisualVerdict {
  pass: boolean
  pixel_diff_ratio: number
  diff_image?: string                       // 偏差区域可视化
  semantic_verdict?: string                 // 视觉判官的文字结论(FAIL 时)
  ignorable_regions?: string[]              // 判定为动态/可忽略的区域
}
```

### ③ 行为神谕(behavioral oracle)—— 黑盒,破自证循环(⟸ 公理1)

由**冻结判据**生成 Playwright 用例,**只驱动运行中的 UI、只断言可见行为 + mock 接口,绝不读源码**。

- 用例从 `criteria` 编译而来(阶段0 由只见判据的 agent 产出,冻结)。
- API 用 MSW 拦截,mock 数据从 `apis.response_shape` 推导。
- 登录态用 Playwright `storageState` 预置,跳过登录流程。
- **黑盒 + 冻结判据** = 验证独立于实现,实现者无法"迁就"测试。

```typescript
interface BehavioralResult {
  total: number; passed: number; failed: number
  failures: Array<{ criterion_id: string; statement: string; observed: string }>  // observed=实际看到的行为
}
```

> **不变量(贯穿全系统):真相只向下流,绝不向上。** 修复 agent 能改源码,**永远不能改 `contract/`(判据/基准图)**。`contract/` 对所有实现期 agent 是写保护路径。这堵死了自治系统的头号死法 —— "agent 改测试去迁就错代码"(⟸ 公理1,4)。

---

## §5 阶段详解

### 阶段0 · 抽丝 → 契约

| 子步骤 | 谁做 | 输入 | 输出 |
|--------|------|------|------|
| Figma 拉取 | **代码**(Figma API) | file url | 原始节点树 + 导出图 |
| Figma 解释 | `figma-interpret`(agent,视觉) | 节点树 | `tokens.json` + `components.json` + 每frame `visual` |
| 需求→判据 | `spec-analyst`(agent,**只见 spec+frame 清单**) | 需求文档 | 每屏 `criteria` + `apis` |
| 双源对齐 | **代码** + `spec-analyst` | 上两者 | 缺口表(有需求无设计 / 有设计无需求) |
| 对抗审查 | `challenger`(agent) | 完整契约草案 | `ChallengeResult`,不过则回 analyst 修正 |
| 成本预估 + gate | **代码** | 屏幕数 + 历史 | 预算估算 → ⏸ 人工确认(或 `--auto` 放行) |

对抗审查维度(在 ant 五维基础上,新增**需求↔设计一致性**,⟸ 公理3):功能遗漏 · 组件粒度 · 接口完整性 · 边界态(empty/loading/error/permission)· 交互歧义 · **需求与 Figma 是否一一对应**。

```typescript
interface ChallengeResult {
  passed: boolean
  issues: Array<{
    category: 'missing_feature'|'granularity'|'api_gap'|'edge_case'|'interaction'|'design_mismatch'
    screen: string; description: string; suggestion: string
  }>
}
```

**人工 gate 的位置即公理4**:它在契约上(最便宜改、最致命错的地方),而非代码上。批准契约后,`--auto` 模式下整夜不再等人。

### 阶段1 · 设计系统先行

`ds-builder` 按 `tokens.json` + `components.json` 实现共享组件库。每个组件在**隔离渲染环境**(Storybook 式 harness)里单独截图,过**视觉神谕**(对 `ComponentSpec.ref_image`)。拓扑上先于屏幕(⟸ 公理5):屏幕依赖组件,组件一次做对、全局复用,避免每屏重复犯同样的视觉错。

### 阶段2 · 每屏闭环(分形单元)

Coordinator 对屏幕做拓扑排序,无依赖者并行,**每屏一个隔离 worktree**(爆炸半径有界,⟸ 公理1,5):

```typescript
async function weaveScreen(screen: ScreenContract): Promise<ScreenStatus> {
  const wt = await git.worktree(`vega/${runId}/${screen.name}`)
  const builder = newScreenBuilder(screen, designSystem, profile)   // context 只含本屏切片 ⟸ 公理1
  await builder.generate()

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const compile = await oracle.compile(wt)
    if (!compile.pass) { await builder.repair(compile.error); continue }   // 同线程,context 本地

    const visual = await oracle.visual(screen, wt)                          // ⟸ 公理6
    if (!visual.pass) { await builder.repair(visual.diff_image, visual.semantic_verdict); continue }

    const behavior = await oracle.behavioral(screen, wt)                    // 黑盒 ⟸ 公理1
    if (!behavior.pass) { await builder.repair(behavior.failures); continue }

    await git.commit(`feat(${screen.name}): 织造完成 [vega]`)
    return { name: screen.name, status: 'done', evidence: collectEvidence(screen, wt) }
  }
  return { name: screen.name, status: 'degraded', evidence: collectEvidence(screen, wt) }  // 优雅降级
}
```

排门顺序 = 成本顺序:编译(最便宜)→ 视觉 → 行为(最贵)。**失败快、修复信号高**:每一次 `repair` 的输入是上一个神谕的**差量**,不是需求复述。修复在同一线程内进行 —— builder 已持有本屏完整 context(⟸ 公理1)。

### 阶段3 · 集成与交付

组装路由 + 全局导航,跑**跨屏流程**校验(登录→列表→详情这类链路)。产出:

1. **可运行项目**(目标仓库的真实分支 `vega/{run-id}`)。
2. **证据型验收报告**(见 §10)—— 报告的可信度来自**展示神谕的输出**(并排截图、diff、判据结果),而非 agent 自称成功。

---

## §6 Agent 清单

所有 agent 遵循统一 6 段式 system prompt(Role / Context / Task / Constraints / Output Format / Few-shot)。**Context 段动态注入目标项目 profile**(CLAUDE.md + skills),内核技术栈中立。

| Agent | 角色 | 输入(隔离) | 输出 | 工具 | 模型(初值) |
|-------|------|-----------|------|------|------|
| `figma-interpret` | 设计系统解析 | Figma 节点树 + 导出图 | tokens/components/visual | 只读 | `claude-opus-4-8`(需视觉) |
| `spec-analyst` | 产品分析 | 需求文档 + frame 清单 | criteria + apis + 缺口 | 只读 | `claude-opus-4-8` |
| `challenger` | PM+QA 对抗 | 契约草案 | `ChallengeResult` | 只读 | `claude-opus-4-8` |
| `ds-builder` | 设计系统工程师 | tokens + 组件规格 | 共享组件库 | 读写 | `claude-sonnet-4-6` |
| `screen-builder` | 前端工程师(含自修复) | 单屏契约 + 设计系统 + profile | 屏幕代码 | 读写 | `claude-sonnet-4-6`,卡住升 `claude-opus-4-8` |
| `visual-judge` | 视觉验官 | 截图 + 基准图 | `VisualVerdict` | 只读视觉 | `claude-opus-4-8`(需视觉) |

> 多模型/升级策略是**优化项**,不是地基。先用单模型把环跑通(见 §15)。

**工具权限硬隔离**:`*-interpret/analyst/challenger/judge` 只读(prompt + guardrail 双重约束);`ds-builder/screen-builder` 读写但 `contract/` 写保护。`screen-builder` 行为受 profile 约束(FSD 分层、禁 any、禁硬编码等,从目标项目 skills 注入)。

---

## §7 不变量(过夜自治真正成立的前提)

这六条是**焊死的**,违反任何一条,无人值守就退化成"赌它别出错":

1. **每个产物都有神谕。**(⟸ 公理2)任何阶段产物都机械对照真相校验。验证不了 = 不能自治地信。
2. **真相只向下流。**(⟸ 公理1,4)契约冻结;实现顺从契约,永不改契约/判据。
3. **确定性边界尽量外推。**(⟸ 公理1)控流、拓扑排序、diff、判门、预算、文件存在性 —— 全用 TS 代码;LLM 只做不可约的部分(Figma 消歧、拆解、生成、调试、视觉判断)。
4. **context 按单元、用完即弃。**(⟸ 公理1)无全局累积 session,阶段间靠 JSON 文件交接。⟹ 有界 context 做无界总量 + 白嫖断点恢复。
5. **爆炸半径有界 + 优雅降级。**(⟸ 公理5)每屏隔离 worktree;一个人类能懂的预算总闸;失败→分类→有界重试→降级上报,绝不无限循环、绝不级联。
6. **系统如实汇报自己。**(⟸ 公理2)交付物带证据 + 诚实缺口清单。不敢说"哪没做完"的过夜系统比没有更糟。

---

## §8 控制流(Coordinator,代码级)

所有分支/循环/并行由 coordinator 的 TS 控制,不靠 LLM 自觉(⟸ 不变量3):

```typescript
async function weave(spec: string, figmaUrl: string, opts: Opts) {
  const contract = await buildContract(spec, figmaUrl)        // 阶段0:抽丝
  for (let r = 0; r < MAX_CHALLENGE_ROUNDS; r++) {            // 对抗循环
    const res = await challenger.run(contract)
    if (res.passed) break
    await analyst.revise(contract, res.issues)
  }
  if (opts.humanGate) await confirmContract(contract)        // 唯一人工卡点 ⟸ 公理4
  freeze(contract)                                            // 之后写保护 ⟸ 不变量2

  await git.createBranch(`vega/${runId}`)
  const designSystem = await buildDesignSystem(contract)      // 阶段1
  const order = topoSort(contract.screens)                    // ⟸ 公理5
  const results = await mapParallel(order, weaveScreen)       // 阶段2,无依赖者并行
  await integrate(results)                                    // 阶段3
  await report(results)                                       // 证据型报告 ⟸ 不变量6
}
```

**错误分类 → 差异化恢复**(避免盲目重试):

| 错误类型 | 恢复策略 | 上限 |
|---------|---------|------|
| `compile` | 错误回灌同线程 builder | 4 |
| `visual_fail` | diff 区域 + 判官结论回灌 | 4 |
| `behavioral_fail` | 失败判据 + observed 回灌 | 4 |
| `schema_validation` | 校验错误回灌,要求重出 | 2 |
| `rate_limit` | 指数退避 | 5 |
| `context_overflow` | 摘要压缩重发 | 1 |
| `hallucination`(引用不存在文件/节点) | 终止该屏,降级上报 | 0 |
| `timeout` | 终止该屏,降级 | 0 |

---

## §9 优雅降级与状态机

单屏失败**不终止**流水线(⟸ 公理5)。Coordinator 维护每屏状态机:

```typescript
type ScreenStatus = 'pending' | 'weaving' | 'done' | 'degraded' | 'skipped'
// 屏 A 织造耗尽预算 → degraded → 继续 B/C/D
// 依赖 A 的屏 E → 自动 skipped
// 集成只组装 done;报告明确列出 degraded/skipped 及其证据与卡点
```

降级规则:`degraded` 屏带**部分证据**(最后一轮截图 + 卡在哪个神谕);依赖未就绪的屏 `skipped`;报告区分"做完了""差一点(degraded)""没做(skipped)"。

---

## §10 可观测性与证据型报告

### Agent 调用落盘

`.runs/{run-id}/logs/{agent}-{n}.json` = `{ input, output, tokens, duration }`(OpenTelemetry Trace 格式),可重放、可审计。

### 实时进度(loom)

```
[00:00] 🧵 抽丝:解析 Figma(12 frames)+ 需求…
[02:10] 📐 契约草案:6 屏 / 14 共享组件 / 38 条判据
[02:11] ⚔️  对抗第1/3轮… 发现 4 处(2 缺设计稿,1 接口缺失,1 边界态)
[03:40] ⚔️  第2轮 通过
[03:41] 💰 预估 ~720k tokens / 见 contract/  ⏸ 等确认(--auto 可跳过)
[06:00] 🎨 设计系统:14/14 组件 视觉过审
[06:01] 🧶 织造 [1/6] home…  [2/6] detail…(并行)
[09:20] 🔍 home:编译✓ 视觉 diff 3.2%>阈值 → 判官:间距偏差,修复中
[10:05] 🔍 home:视觉✓ 行为 11/12,修复中
[11:30] ✅ home 全绿 commit
[14:00] 📊 6 屏:5 done / 1 degraded(settings 卡在视觉,见证据)
[14:01] ✦ 交付 → 分支 vega/xxx,报告 .runs/xxx/report/
```

### 证据型验收报告(⟸ 不变量6)

```
report/
├── index.html              ← 总览:每屏状态 + 通过率
├── screens/home/
│   ├── compare.png         ← Figma 基准 | 实际截图 | diff,三栏并排
│   ├── criteria.md         ← 38 条判据逐条 pass/fail + observed
│   └── verdict.json
└── gaps.md                 ← 诚实缺口:degraded/skipped 屏 + 卡在哪 + 建议人工动作
```

报告**展示神谕输出**而非 agent 自述 —— 可信度来自证据本身。

---

## §11 项目结构(技术栈中立内核 + 可插拔 profile)

```
vega/
├── src/
│   ├── index.ts              ← CLI 入口
│   ├── coordinator.ts        ← 控制流(代码级,§8)
│   ├── contract/
│   │   ├── schema.ts         ← 契约 Zod schema
│   │   └── store.ts          ← 契约读写 + 冻结 + 写保护
│   ├── parse/                ← 阶段0
│   │   ├── figma.ts          ← Figma API 拉取(纯代码)
│   │   ├── figma-interpret.ts← agent:节点树 → tokens/components
│   │   ├── spec-analyst.ts   ← agent:需求 → criteria/apis
│   │   └── reconcile.ts      ← 双源对齐(代码)
│   ├── agents/
│   │   ├── challenger.ts
│   │   ├── ds-builder.ts
│   │   └── screen-builder.ts ← 含自修复循环
│   ├── oracle/               ← 神谕系统(§4)—— 系统心脏
│   │   ├── compile.ts        ← typecheck/lint
│   │   ├── visual.ts         ← pixelmatch + 升级判官
│   │   ├── visual-judge.ts   ← agent:LLM-vision
│   │   └── behavioral.ts     ← Playwright 跑冻结判据(黑盒)
│   ├── guardrails/
│   │   ├── input.ts · output.ts · safety.ts   ← 三层护栏
│   ├── profiles/             ← 技术栈适配(可换),内核不认识 FSD
│   │   ├── fsd.yml
│   │   └── next-app.yml
│   └── utils/
│       ├── session.ts · git.ts · worktree.ts · budget.ts
│       ├── topo.ts · progress.ts · reporter.ts · logger.ts · resume.ts
├── templates/                ← 报告/判据/组件模板
├── vega.config.yml
└── .runs/                    ← 运行时产物(git ignored)
```

**profile 是从 ant 升级到织女的分水岭**:目标项目的规范(FSD/Next/纯 React…)运行时从其 `CLAUDE.md` + skills 注入,内核保持中立。

---

## §12 运行时产物布局

```
.runs/{run-id}/
├── contract/               ← 冻结契约(§3,唯一真相)
├── status.json             ← 每屏状态机
├── worktrees/{screen}/     ← 每屏隔离工作区
├── oracle/{screen}/
│   ├── shot@default.png    ← 实际截图
│   ├── diff@default.png    ← 视觉差量
│   └── behavioral.json
├── logs/                   ← agent 调用日志
├── report/                 ← 证据型报告(§10)
└── history.json            ← 运行历史(成本校准 + few-shot 来源,优化项)
```

支持断点恢复:coordinator 启动检查产物,已完成阶段直接读取跳过。

---

## §13 配置(vega.config.yml)

```yaml
pipeline:
  human_gate: true            # false = 无人值守,自动放行契约 gate
  max_challenge_rounds: 3
  max_repair_rounds: 4
  parallel_screens: true
  stage_timeout_ms: 900000

oracle:
  visual:
    pixel_threshold: 0.02     # 像素差比例阈值(超则升级判官)
    escalate_to_vision: true  # 越阈交 LLM-vision 判语义
    ignore_dynamic: true      # 忽略动态内容区域
  behavioral:
    runner: playwright
    api_mock: msw

agents:                       # 多模型为优化项,先单模型跑通
  figma_interpret: { model: claude-opus-4-8 }
  spec_analyst:    { model: claude-opus-4-8 }
  challenger:      { model: claude-opus-4-8 }
  ds_builder:      { model: claude-sonnet-4-6 }
  screen_builder:  { model: claude-sonnet-4-6, escalate_on_stuck: claude-opus-4-8 }
  visual_judge:    { model: claude-opus-4-8 }

budget:
  total_ceiling: 5000000      # 硬上限:过夜跑的总闸,撞上即停
  per_screen: 200000
  warn_only: false

profile: ./src/profiles/fsd.yml   # 技术栈适配,可换

guardrails:
  protected_paths: [contract/, .git/, node_modules/, package.json]
  blocked_commands: ["rm -rf", "git push", "git reset --hard"]
```

---

## §14 CLI

```bash
vega weave --spec ./req.md --figma <url>          # 启动织造(默认带人工 gate)
vega weave --spec ./req.md --figma <url> --auto   # 无人值守,过夜跑
vega loom                                         # 查看任务流水/实时进度
vega inspect [run-id]                             # 打开证据型验收报告
vega weave --resume <run-id> [--from <stage>]     # 断点恢复
vega weave ... --screens home,detail              # 只织指定屏
vega weave ... --dry-run                          # 只到契约+对抗+成本预估,不织
vega weave ... --history                          # 历史运行统计
```

---

## §15 里程碑(别学 ant 过早工程化)

先建**最薄的、能闭合的脊柱**,证明环能闭合,再加优化:

```
M0  脊柱闭合(只此一条优先)
    一屏 · 一 frame · 单模型
    生成 → 视觉神谕(pixelmatch)→ 同线程修复 → 交付
    证明:render→diff→repair 这个环能自动收敛到视觉过审

M1  三神谕齐全
    + 编译神谕 + 行为神谕(冻结判据黑盒)+ 视觉判官第二层

M2  规模化
    + 多屏拓扑并行 + 设计系统层 + 每屏隔离 worktree + 优雅降级

M3  自治化
    + 契约对抗 gate + --auto 无人值守 + 预算总闸 + 断点恢复 + 证据报告

M4  优化(全部是优化,不是地基)
    + 多模型/升级 + 运行历史 few-shot + 成本校准 + profile 生态
```

**判据**:M0 不通过(视觉环不能自动收敛),后面全都不做 —— 因为那意味着织女最核心的假设(视觉 diff 是可驱动修复的高信号神谕)不成立。

---

## §16 技术依赖

| 依赖 | 用途 |
|------|------|
| `@anthropic-ai/claude-agent-sdk` | Agent 编排、内置工具、结构化输出、Session |
| Figma REST API | 设计稿节点树 + 令牌 + 导出基准图 |
| `playwright` | 渲染截图 + 行为神谕(黑盒 e2e) |
| `pixelmatch` / `odiff` | 视觉神谕第一层(像素/感知 diff) |
| `msw` | 接口 mock(行为神谕环境) |
| `zod` | 契约 + 结构化输出 schema 校验(护栏) |
| `yaml` | 配置解析 |
| `simple-git` | 分支 / worktree / commit |

---

<div align="center">
<sub>一句话:<b>ant 把验证当工序,织女把验证当架构本身;ant 信需求文档,织女信 Figma 这唯一的可执行真相。</b><br/>把「每个产物都有神谕」和「真相只向下流」焊死,过夜无人值守才不是口号。</sub>
</div>
