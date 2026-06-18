import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type SpecManifest } from '@/lib/api'

interface Props {
  ready: boolean
  onParsed: (manifest: SpecManifest) => void
}

export function ParsePanel({ ready, onParsed }: Props) {
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)

  async function handleParse() {
    const trimmed = url.trim()
    if (!trimmed) return
    setParsing(true)
    try {
      const { manifest } = await api.parse(trimmed)
      onParsed(manifest)
      toast.success(
        `《${manifest.title}》解析完成 · ${manifest.counts.images} 张图`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '解析失败')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="https://your.feishu.cn/wiki/xxxx"
          value={url}
          disabled={!ready || parsing}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleParse()
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={handleParse}
          disabled={!ready || parsing || !url.trim()}
        >
          {parsing ? <Loader2 className="size-4 animate-spin" /> : '解析'}
        </Button>
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {ready
          ? '粘贴飞书文档链接(/docx/ 或 /wiki/),解析正文与图片并落盘。'
          : '请先在「飞书配置」填好 app_id / app_secret。'}
      </p>
    </div>
  )
}
