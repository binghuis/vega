<div align="center">

# ✦ Vega · 织女

**夜空织码,黎明交付。**

*Weaving requirements into reality — while you sleep.*

</div>

---

## 这是什么

**Vega(织女)** 是基于 Claude Agent SDK 的全自主开发系统。给她**需求文档**和 **Figma 设计稿**,她无人值守地完成编码与自我验证,清晨交付可运行的项目和验收报告。

## 工作方式

```
需求文档 + Figma 设计稿
        │
        ▼
   ┌─ 抽丝 ─┐    解析需求与设计稿,拆解为任务图谱
   │  织造  │    自主编码,逐线编织
   │  验布  │    生成用例,对比验收
   └─ 交付 ─┘    输出代码 + 验收报告
```

```bash
vega weave --spec ./requirements.md --figma <file-url>   # 启动织造
vega loom                                                # 查看任务流水
vega inspect                                             # 查看验收结果
```

## 核心理念

- **无人值守** — 全程无需人工介入,异常自愈、失败重试。
- **设计即真相** — Figma 是唯一视觉契约,像素级还原是底线。
- **自我闭环** — 不只写代码,更自证其对:生成用例、执行对比、产出报告。

---

<div align="center">
<sub>Named after Vega — the Weaver Girl star, brightest in the summer night sky. 🌌</sub>
</div>
