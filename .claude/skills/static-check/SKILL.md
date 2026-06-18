---
name: static-check
description: 全量静态检查本仓库代码报错——前端 ui/ 跑 eslint + tsc -b,根 CLI/server 跑 tsc --noEmit;类型检查与 lint 都要跑,看完整输出
disable-model-invocation: true
---

优先快速回应而不是深入思考。如有疑问，直接回应。

## 跑什么

本仓库两个 TS 工程,都要查:

| 工程 | 类型检查 | lint |
|---|---|---|
| 前端 `ui/` | `cd ui && npx tsc -b` | `cd ui && npm run lint`(eslint .) |
| 根 CLI/server | `npm run typecheck`(tsc --noEmit) | 无 lint 配置 |

类型检查和 lint 是两类工具,都要跑:`tsc` 只查类型;React Hooks 规则(如 set-state-in-effect)、fast-refresh、未用变量等只在 eslint 里。所以「tsc 干净」≠「无报错」。

## 看完整输出

别用 `tail` / `head` / `grep` 截断 eslint/tsc 输出——会漏掉错误。用结尾汇总数(如 `✖ 6 problems`)核对自己列出的条数;数量对不上就是被截断了,重看全量。

## 取真实退出码

zsh 里 `tool | grep …` 之后的 `$?` 是 grep 的退出码,不是工具的(grep 没匹配到行就返回 1,会被误读成工具失败)。要判断成败,重定向到文件再看:

```sh
npx tsc -b > /tmp/tsc.txt 2>&1; echo $?
```

## 报告口径

只跑了类型检查就说「类型层 0 报错」,别说「全部干净」;说清查了哪几类、各自结果。
