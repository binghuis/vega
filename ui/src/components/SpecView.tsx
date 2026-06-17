import { useEffect, useState } from 'react'
import {
  ExternalLink,
  FileText,
  ImageIcon,
  ListChecks,
  Loader2,
} from 'lucide-react'

import { StructuredView } from '@/components/StructuredView'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type SpecManifest } from '@/lib/api'

interface Props {
  spec: SpecManifest
}

type DocState =
  | { status: 'loading' }
  | { status: 'loaded'; text: string }
  | { status: 'error'; message: string }

export function SpecView({ spec }: Props) {
  const id = spec.source.documentId
  const [doc, setDoc] = useState<DocState>({ status: 'loading' })

  // 图片 token → 直链(供结构化视图显示缩略图)
  const assetByToken = new Map(spec.assets.map((a) => [a.fileToken, a.file]))
  const imageUrl = (token: string) => {
    const file = assetByToken.get(token)
    return file ? api.assetUrl(id, file) : null
  }

  useEffect(() => {
    let alive = true
    setDoc({ status: 'loading' })
    api
      .getDocument(id)
      .then((text) => alive && setDoc({ status: 'loaded', text }))
      .catch(
        (e: unknown) =>
          alive &&
          setDoc({
            status: 'error',
            message: e instanceof Error ? e.message : '加载失败',
          }),
      )
    return () => {
      alive = false
    }
  }, [id])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {spec.title}
          <a
            href={spec.source.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="在飞书打开"
          >
            <ExternalLink className="size-4" />
          </a>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{spec.source.kind}</Badge>
          <Badge variant="secondary">{spec.counts.blocks} blocks</Badge>
          <Badge variant="secondary">{spec.counts.images} 图</Badge>
          <Badge variant="secondary">
            {(spec.counts.bytes / 1024).toFixed(0)} KB
          </Badge>
          <span className="text-muted-foreground text-xs">
            {new Date(spec.fetchedAt).toLocaleString()}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="document">
          <TabsList>
            <TabsTrigger value="document">
              <FileText className="size-4" />
              正文
            </TabsTrigger>
            <TabsTrigger value="images">
              <ImageIcon className="size-4" />
              图片 {spec.counts.images}
            </TabsTrigger>
            <TabsTrigger value="structured">
              <ListChecks className="size-4" />
              结构化
            </TabsTrigger>
          </TabsList>

          <TabsContent value="document" className="mt-4">
            {doc.status === 'loading' && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                加载正文…
              </div>
            )}
            {doc.status === 'error' && (
              <p className="text-destructive text-sm">{doc.message}</p>
            )}
            {doc.status === 'loaded' && (
              <pre className="bg-muted/40 max-h-[60vh] overflow-auto rounded-md p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                {doc.text}
              </pre>
            )}
          </TabsContent>

          <TabsContent value="images" className="mt-4">
            {spec.assets.length === 0 ? (
              <p className="text-muted-foreground text-sm">无图片</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {spec.assets.map((asset) => (
                  <a
                    key={asset.fileToken}
                    href={api.assetUrl(id, asset.file)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:border-ring block overflow-hidden rounded-md border"
                  >
                    <img
                      src={api.assetUrl(id, asset.file)}
                      alt={asset.fileToken}
                      loading="lazy"
                      className="bg-muted/30 h-40 w-full object-contain"
                    />
                  </a>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="structured" className="mt-4">
            <StructuredView specId={id} imageUrl={imageUrl} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
