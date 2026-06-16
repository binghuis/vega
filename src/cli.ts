/**
 * vega CLI 入口。
 *
 * 当前仅实现「需求飞书解析落盘」这条 headless 脊柱(DESIGN M0:先把最薄的环跑通):
 *   vega parse <飞书文档链接>
 *
 * 后续阶段(server / 结构化 / 织造)再扩子命令。
 */
import { parseFeishuDoc } from './parse/feishu'

/** 尽力加载 .env(凭据兜底);没有也不报错,真正缺凭据时由 config 层提示 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* 没有 .env 文件,忽略 */
  }
}

function usage(): void {
  console.log(
    [
      'vega — 夜空织码,黎明交付',
      '',
      '用法:',
      '  vega parse <飞书文档链接>   解析飞书需求文档(含图片)并落盘到 .vega/specs/<id>/',
      '',
      '示例:',
      '  vega parse https://your.feishu.cn/wiki/xxxxxxxx',
    ].join('\n'),
  )
}

async function cmdParse(url: string | undefined): Promise<void> {
  if (!url) {
    console.error('缺少链接。用法:vega parse <飞书文档链接>')
    process.exitCode = 1
    return
  }
  const { specDir, manifest } = await parseFeishuDoc(url, (msg) =>
    console.log(`  · ${msg}`),
  )
  console.log('')
  console.log(`✦ 解析完成:《${manifest.title}》`)
  console.log(
    `  blocks ${manifest.counts.blocks} · 图片 ${manifest.counts.images} 张 · ` +
      `${(manifest.counts.bytes / 1024).toFixed(1)} KB`,
  )
  console.log(`  落盘 → ${specDir}`)
}

async function main(): Promise<void> {
  loadDotEnv()
  const [cmd, arg] = process.argv.slice(2)

  switch (cmd) {
    case 'parse':
      await cmdParse(arg)
      break
    case undefined:
    case '-h':
    case '--help':
      usage()
      break
    default:
      console.error(`未知命令:${cmd}`)
      usage()
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
  // 网络类错误真因藏在 cause(undici 的 "fetch failed" 本身无信息)
  const cause = (err as { cause?: unknown }).cause
  if (cause) {
    const c = cause as { code?: string; message?: string }
    console.error(`  cause: ${c.code ?? ''} ${c.message ?? String(cause)}`.trim())
  }
  process.exitCode = 1
})
