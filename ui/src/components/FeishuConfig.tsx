import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type FeishuConfigState } from '@/lib/api'

interface Props {
  config: FeishuConfigState | null
  onSaved: (next: FeishuConfigState) => void
}

export function FeishuConfig({ config, onSaved }: Props) {
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://open.feishu.cn')
  const [saving, setSaving] = useState(false)

  // 配置回显:app_id / 域名回填,secret 永不回显(后端也不返回)
  useEffect(() => {
    if (!config) return
    setAppId(config.appId)
    setBaseUrl(config.baseUrl)
  }, [config])

  async function handleSave() {
    setSaving(true)
    try {
      const next = await api.saveFeishuConfig({
        appId,
        baseUrl,
        // secret 留空表示不改动
        ...(appSecret ? { appSecret } : {}),
      })
      setAppSecret('')
      onSaved(next)
      toast.success('飞书配置已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          飞书配置
          {config?.ready ? (
            <Badge variant="secondary" className="ml-1 gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              就绪
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-1">
              未配置
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          自建应用的 app_id / app_secret(开放平台 → 凭证与基础信息)。保存在本地
          .vega/config.json,不外传。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="appId">App ID</Label>
          <Input
            id="appId"
            placeholder="cli_xxxxxxxx"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="appSecret">App Secret</Label>
          <Input
            id="appSecret"
            type="password"
            placeholder={
              config?.hasSecret ? '已配置(留空则不改动)' : '请输入 app_secret'
            }
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="baseUrl">开放平台域名</Label>
          <Input
            id="baseUrl"
            placeholder="https://open.feishu.cn"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            飞书国内版用 open.feishu.cn;Lark 国际版用 open.larksuite.com
          </p>
        </div>
        <div>
          <Button onClick={handleSave} disabled={saving || !appId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            保存配置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
