import { useState } from 'react'
import { CheckCircle2, ChevronDown, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { api, type FeishuConfigState } from '@/lib/api'

interface Props {
  config: FeishuConfigState | null
  onSaved: (next: FeishuConfigState) => void
}

export function FeishuConfig({ config, onSaved }: Props) {
  const [appId, setAppId] = useState(config?.appId ?? '')
  const [appSecret, setAppSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? 'https://open.feishu.cn')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const ready = config?.ready ?? false
  // 低频配置:就绪后默认折叠为一行;未配置时强制展开引导填写
  const expanded = open || !ready

  // 配置回显:config 异步到达或保存后变化时,渲染期回填 app_id / 域名
  // (secret 永不回显,后端也不返回);用渲染期同步替代 effect 内 setState,避免级联渲染
  const [prevConfig, setPrevConfig] = useState(config)
  if (config !== prevConfig) {
    setPrevConfig(config)
    setAppId(config?.appId ?? '')
    setBaseUrl(config?.baseUrl ?? 'https://open.feishu.cn')
  }

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
      setOpen(false) // 保存成功后收起
      toast.success('飞书配置已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!ready}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-6 py-3.5 text-left text-sm font-medium disabled:cursor-default"
      >
        <KeyRound className="text-muted-foreground size-4" />
        飞书配置
        {ready ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="text-success size-3" />
            就绪
          </Badge>
        ) : (
          <Badge variant="outline">未配置</Badge>
        )}
        {ready && (
          <ChevronDown
            className={cn(
              'text-muted-foreground ml-auto size-4 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        )}
      </button>

      {expanded && (
        <CardContent className="grid gap-4 px-6 pb-6">
          <CardDescription>
            自建应用的 app_id / app_secret(开放平台 → 凭证与基础信息)。保存在本地
            .vega/config.json,不外传。
          </CardDescription>
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
      )}
    </Card>
  )
}
