/**
 * 结构化模型 provider(可替换 —— DESIGN §6「生成器可替换」)。
 *
 * 泛型 callModel:给定 system + 中立消息片段(文本/图)+ 一个 zod schema,
 * 返回经该 schema 校验的对象。两条路径:
 *   - anthropic:Claude(messages.parse + zodOutputFormat)
 *   - openai:OpenAI 兼容(智谱 GLM-4V / 通义 Qwen-VL / Gemini / 本地 Ollama)
 *     视觉走 image_url(data URL);结构化走 response_format=json_object + 提示带 schema + zod 校验 + 重试。
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

import type { StructureConfig } from '../config'

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: string; dataB64: string }

type ImageMedia = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

async function viaAnthropic<T extends z.ZodType>(
  system: string,
  parts: Part[],
  schema: T,
  cfg: StructureConfig,
): Promise<z.infer<T>> {
  const content: Anthropic.ContentBlockParam[] = parts.map((p) =>
    p.kind === 'text'
      ? { type: 'text', text: p.text }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: p.mediaType as ImageMedia,
            data: p.dataB64,
          },
        },
  )
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: 600_000 })
  const res = await client.messages.parse({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(schema) },
  })
  if (!res.parsed_output) {
    throw new Error(`结构化失败:模型未产出合法结果(stop_reason=${res.stop_reason})`)
  }
  return res.parsed_output as z.infer<T>
}

/** 去掉模型有时多包的 ```json ... ``` 围栏 */
function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

async function viaOpenAICompatible<T extends z.ZodType>(
  system: string,
  parts: Part[],
  schema: T,
  cfg: StructureConfig,
  example: string,
): Promise<z.infer<T>> {
  // 弱模型对「draft JSON Schema」常会原样复述,改用「填好的示例实例」引导仿写
  const sys =
    system +
    '\n\n严格按下面示例的 JSON 结构输出一个【数据实例】:把示例里的占位值换成真实内容,保留所有字段名,空的给空数组或 null。只输出这一个 JSON,不要复述 schema、不要解释、不要 markdown 围栏。\n\n示例:\n' +
    example

  const content = parts.map((p) =>
    p.kind === 'text'
      ? { type: 'text', text: p.text }
      : {
          type: 'image_url',
          image_url: { url: `data:${p.mediaType};base64,${p.dataB64}` },
        },
  )

  const MAX_ATTEMPTS = 4
  let lastErr = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 600 * 2 ** attempt))
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: cfg.maxTokens,
        // 智谱 GLM-4.5+/5 系的深度思考(其它家无此字段时不传)
        ...(cfg.thinking ? { thinking: { type: 'enabled' } } : {}),
      }),
    })
    // 瞬时错误(限流 429 / 过载 / 5xx)→ 退避重试
    if (resp.status === 429 || resp.status >= 500) {
      lastErr = `HTTP ${resp.status}(瞬时,退避重试)`
      continue
    }
    const raw = (await resp.json()) as ChatResponse
    if (!resp.ok) {
      throw new Error(
        `结构化 provider 报错(HTTP ${resp.status}):${raw.error?.message ?? JSON.stringify(raw).slice(0, 200)}`,
      )
    }
    const text = raw.choices?.[0]?.message?.content ?? ''
    try {
      let data: unknown = JSON.parse(stripFences(text))
      // 弱模型有时把对象包进单元素数组,自动拆开
      if (Array.isArray(data) && data.length >= 1 && typeof data[0] === 'object') {
        data = data[0]
      }
      return schema.parse(data) as z.infer<T>
    } catch (e) {
      lastErr = `${e instanceof Error ? e.message : String(e)} | 原文 ${text.length} 字,片段: ${text.slice(0, 200)}`
    }
  }
  throw new Error(`结构化失败(重试 ${MAX_ATTEMPTS} 次后):${lastErr}`)
}

/**
 * 调模型并按 schema 校验返回(provider 可换)。
 * example:填好的示例实例,给 OpenAI 兼容路径仿写用(anthropic 路径由 API 强约束,忽略)。
 */
export function callModel<T extends z.ZodType>(
  system: string,
  parts: Part[],
  schema: T,
  cfg: StructureConfig,
  example: string,
): Promise<z.infer<T>> {
  return cfg.provider === 'anthropic'
    ? viaAnthropic(system, parts, schema, cfg)
    : viaOpenAICompatible(system, parts, schema, cfg, example)
}
