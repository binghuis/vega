import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          解析飞书需求文档
        </CardTitle>
        <CardDescription>
          粘贴飞书文档链接(/docx/ 或 /wiki/),解析正文与图片并落盘。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder="https://your.feishu.cn/wiki/xxxx"
            value={url}
            disabled={!ready || parsing}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleParse()
            }}
          />
          <Button onClick={handleParse} disabled={!ready || parsing || !url.trim()}>
            {parsing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                解析中
              </>
            ) : (
              '解析'
            )}
          </Button>
        </div>
        {!ready && (
          <p className="text-muted-foreground mt-2 text-xs">
            请先在「飞书配置」填好 app_id / app_secret。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
