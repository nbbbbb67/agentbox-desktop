import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { QrCode, RefreshCw, ShieldCheck, X, Copy, Check, ExternalLink, Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShellLayout } from './ShellLayout'
import type {
  WeChatChannelConfig,
  WeChatPairingRequest,
  WeChatApprovedSender,
  OpenClawConfig,
} from '../../shared/types'

export interface WeChatAccessViewProps {
  onBack?: () => void
}

function defaultNavigateBack() {
  window.location.hash = '#settings'
}

function formatTimestamp(value: string | undefined, unknownLabel: string): string {
  if (!value) return unknownLabel
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts))
}

function mergeWeChatCredentials(
  cfg: OpenClawConfig,
  agentId: string,
  appSecret: string,
  token: string,
  encodingAesKey: string,
): OpenClawConfig {
  const prev = cfg.channels?.wechat
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? ({ ...prev } as WeChatChannelConfig)
      : ({} as WeChatChannelConfig)

  const next: WeChatChannelConfig = {
    ...base,
    agentId,
    appSecret,
    token,
    encodingAesKey,
    enabled: true,
  }

  if (!next.dmPolicy || String(next.dmPolicy).trim() === '') {
    next.dmPolicy = 'pairing'
  }

  // Also register under openclaw-weixin for compatibility
  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      wechat: next,
      'openclaw-weixin': next,
    },
  }
}

/** Generate a simple QR code as data URL using canvas */
function generateQRCodeDataUrl(text: string, size = 200): string {
  // Use a simple QR code generation approach
  // In production, you'd use a library like qrcode or react-qr-code
  // Here we create an SVG-based QR placeholder that encodes the text
  const qr = text
  const cellSize = Math.floor(size / 25)
  const qrSize = cellSize * 25

  // Simple visual placeholder - in production use actual QR lib
  // This creates a visual representation
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${qrSize} ${qrSize}">
      <rect width="${qrSize}" height="${qrSize}" fill="white"/>
      <rect x="0" y="0" width="${cellSize * 7}" height="${cellSize * 7}" fill="black"/>
      <rect x="${cellSize}" y="${cellSize}" width="${cellSize * 5}" height="${cellSize * 5}" fill="white"/>
      <rect x="${cellSize * 2}" y="${cellSize * 2}" width="${cellSize * 3}" height="${cellSize * 3}" fill="black"/>
      <rect x="${qrSize - cellSize * 7}" y="0" width="${cellSize * 7}" height="${cellSize * 7}" fill="black"/>
      <rect x="${qrSize - cellSize * 6}" y="${cellSize}" width="${cellSize * 5}" height="${cellSize * 5}" fill="white"/>
      <rect x="${qrSize - cellSize * 5}" y="${cellSize * 2}" width="${cellSize * 3}" height="${cellSize * 3}" fill="black"/>
      <rect x="0" y="${qrSize - cellSize * 7}" width="${cellSize * 7}" height="${cellSize * 7}" fill="black"/>
      <rect x="${cellSize}" y="${qrSize - cellSize * 6}" width="${cellSize * 5}" height="${cellSize * 5}" fill="white"/>
      <rect x="${cellSize * 2}" y="${qrSize - cellSize * 5}" width="${cellSize * 3}" height="${cellSize * 3}" fill="black"/>
      <text x="${qrSize / 2}" y="${qrSize / 2 + cellSize * 4}" font-family="Arial" font-size="${cellSize * 1.5}" text-anchor="middle" fill="#333">Scan</text>
    </svg>
  `
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/** Generate a real QR code using the QR Server API (online) or built-in */
function getQRCodeUrl(text: string, size = 200): string {
  // Use a free QR code service
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`
}

export function WeChatAccessView({ onBack }: WeChatAccessViewProps = {}) {
  const { t } = useTranslation()
  const handleBack = onBack ?? defaultNavigateBack
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pending, setPending] = useState<WeChatPairingRequest[]>([])
  const [approved, setApproved] = useState<WeChatApprovedSender[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [manualPairingCode, setManualPairingCode] = useState('')
  const [agentId, setAgentId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [token, setToken] = useState('')
  const [encodingAesKey, setEncodingAesKey] = useState('')
  const [credentialsLoading, setCredentialsLoading] = useState(true)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [showAppSecret, setShowAppSecret] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrRefreshing, setQrRefreshing] = useState(false)
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hasWeChatChannel, setHasWeChatChannel] = useState(false)

  const loadCredentials = useCallback(async () => {
    setCredentialsLoading(true)
    try {
      const cfg = await window.electronAPI.configRead()
      const w = cfg?.channels?.wechat ?? cfg?.channels?.['openclaw-weixin']
      setAgentId(typeof w?.agentId === 'string' ? w.agentId : '')
      setAppSecret(typeof w?.appSecret === 'string' ? w.appSecret : '')
      setToken(typeof w?.token === 'string' ? w.token : '')
      setEncodingAesKey(typeof w?.encodingAesKey === 'string' ? w.encodingAesKey : '')
      setHasWeChatChannel(Boolean(w && (w.agentId || w.appSecret)))
    } catch {
      // non-fatal
    } finally {
      setCredentialsLoading(false)
    }
  }, [])

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      // Try to list pending WeChat pairing requests via IPC
      // The actual pairing data comes from the openclaw-weixin plugin
      const pendingResult = await window.electronAPI.pairingListPending({ channel: 'wechat' }).catch(() => ({
        requests: [] as WeChatPairingRequest[],
      }))
      const approvedResult = await window.electronAPI.pairingListApproved({ channel: 'wechat' }).catch(() => ({
        senders: [] as WeChatApprovedSender[],
      }))
      setPending((pendingResult as { requests: WeChatPairingRequest[] }).requests ?? [])
      setApproved((approvedResult as { senders: WeChatApprovedSender[] }).senders ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shell.wechat.loadFailed'))
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [t])

  const refreshQRCode = useCallback(() => {
    setQrRefreshing(true)
    const gatewayStatus = window.electronAPI.gatewayStatus()
    const baseUrl = `http://127.0.0.1:${gatewayStatus?.port ?? 18789}`
    const qrUrl = getQRCodeUrl(`${baseUrl}/wechat/pairing?ts=${Date.now()}`, 200)
    setQrCodeUrl(qrUrl)
    setTimeout(() => setQrRefreshing(false), 500)
  }, [])

  useEffect(() => {
    void loadCredentials()
    void refresh()
    refreshQRCode()

    // Auto-refresh QR code every 30s
    qrIntervalRef.current = setInterval(refreshQRCode, 30_000)

    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current)
    }
  }, [loadCredentials, refresh, refreshQRCode])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh(true)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const handleSaveCredentials = async () => {
    if (!agentId.trim() || !appSecret.trim()) {
      setError(t('shell.wechat.credentialsRequired'))
      setNotice(null)
      return
    }
    setSavingCredentials(true)
    setError(null)
    setNotice(null)
    try {
      const cfg = (await window.electronAPI.configRead()) as OpenClawConfig
      const merged = mergeWeChatCredentials(cfg, agentId.trim(), appSecret.trim(), token.trim(), encodingAesKey.trim())
      await window.electronAPI.configWrite(merged)
      setNotice(t('shell.wechat.credentialsSaved'))
      refreshQRCode()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shell.wechat.credentialsSaveFailed'))
    } finally {
      setSavingCredentials(false)
    }
  }

  const handleApprove = async (code: string, wxid?: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusyKey(`approve:${trimmed}`)
    setNotice(null)
    setError(null)
    try {
      const result = await window.electronAPI.pairingApprove({
        channel: 'wechat',
        code: trimmed,
        ...(wxid?.trim() ? { openId: wxid.trim() } : {}),
      })
      if (!result.ok) {
        setError(result.message || t('shell.wechat.approveFailed'))
        return
      }
      setNotice(t('shell.wechat.approveSuccess', { code: trimmed }))
      setManualPairingCode('')
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shell.wechat.approveFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemoveApproved = async (wxid: string) => {
    setBusyKey(`remove:${wxid}`)
    setNotice(null)
    setError(null)
    try {
      await window.electronAPI.pairingRemoveApproved({ channel: 'wechat', openId: wxid })
      setNotice(t('shell.wechat.removedFromAllowlist', { wxid }))
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shell.wechat.removeFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(t('shell.wechat.copied', { value }))
    } catch {
      setError(t('shell.wechat.clipboardError'))
    }
  }

  const handleExportConfig = () => {
    void window.electronAPI.configRead().then((cfg) => {
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'agentbox-config.json'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const unknownTime = t('shell.wechat.unknownTime')
  const pendingCount = pending.length
  const approvedCount = approved.length
  const hasPending = pendingCount > 0

  return (
    <ShellLayout title={t('shell.wechat.title')} onBack={handleBack}>
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t('shell.wechat.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('shell.wechat.subtitle')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={refreshing || loading}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {t('shell.wechat.refresh')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportConfig}>
                <Download className="w-4 h-4" />
                {t('shell.wechat.exportConfig')}
              </Button>
            </div>
          </div>
        </header>

        {/* QR Code Section */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              {qrCodeUrl ? (
                <div className="relative">
                  <img
                    src={qrCodeUrl}
                    alt="WeChat QR Code"
                    width={200}
                    height={200}
                    className="rounded-lg border border-border"
                  />
                  {qrRefreshing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                      <Loader2 className="w-8 h-8 animate-spin text-white" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-[200px] h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <h2 className="text-sm font-semibold">{t('shell.wechat.qrTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('shell.wechat.qrDesc')}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refreshQRCode} disabled={qrRefreshing}>
                  <RefreshCw className={`w-4 h-4 ${qrRefreshing ? 'animate-spin' : ''}`} />
                  {t('shell.wechat.refreshQR')}
                </Button>
              </div>
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t('shell.wechat.qrTip')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Credentials Section */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h2 className="text-sm font-semibold">{t('shell.wechat.credentialsSection')}</h2>
              <p className="text-xs text-muted-foreground">{t('shell.wechat.credentialsSectionDesc')}</p>
            </div>
            <a
              href="https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
            >
              {t('shell.wechat.devDocs')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {credentialsLoading ? (
            <p className="text-sm text-muted-foreground">{t('shell.settings.loading')}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <fieldset className="space-y-1.5">
                  <label htmlFor="wechat-agent-id" className="text-sm font-medium">
                    {t('shell.wechat.agentId')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="wechat-agent-id"
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder={t('shell.wechat.agentIdPlaceholder')}
                    className="font-mono"
                    autoComplete="off"
                  />
                </fieldset>
                <fieldset className="space-y-1.5">
                  <label htmlFor="wechat-app-secret" className="text-sm font-medium">
                    {t('shell.wechat.appSecret')} <span className="text-destructive">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="wechat-app-secret"
                      type={showAppSecret ? 'text' : 'password'}
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value)}
                      placeholder={t('shell.wechat.appSecretPlaceholder')}
                      className="font-mono flex-1"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setShowAppSecret((v) => !v)}
                    >
                      {showAppSecret ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </Button>
                  </div>
                </fieldset>
                <fieldset className="space-y-1.5">
                  <label htmlFor="wechat-token" className="text-sm font-medium">
                    {t('shell.wechat.token')}
                  </label>
                  <Input
                    id="wechat-token"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('shell.wechat.tokenPlaceholder')}
                    className="font-mono"
                    autoComplete="off"
                  />
                </fieldset>
                <fieldset className="space-y-1.5">
                  <label htmlFor="wechat-aes-key" className="text-sm font-medium">
                    {t('shell.wechat.encodingAesKey')}
                  </label>
                  <Input
                    id="wechat-aes-key"
                    type="text"
                    value={encodingAesKey}
                    onChange={(e) => setEncodingAesKey(e.target.value)}
                    placeholder={t('shell.wechat.encodingAesKeyPlaceholder')}
                    className="font-mono"
                    autoComplete="off"
                  />
                </fieldset>
              </div>
              <p className="text-xs text-muted-foreground">{t('shell.wechat.credentialsRestartHint')}</p>
              <Button type="button" onClick={() => void handleSaveCredentials()} disabled={savingCredentials}>
                {savingCredentials ? t('shell.wechat.savingCredentials') : t('shell.wechat.saveCredentials')}
              </Button>
            </>
          )}
        </section>

        {/* Notice / Error */}
        {notice && (
          <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {notice}
          </section>
        )}
        {error && (
          <section className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </section>
        )}

        {/* Pending pairing requests */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('shell.wechat.pendingTitle')}</h2>
              <p className="text-xs text-muted-foreground mt-1">{t('shell.wechat.pendingDesc')}</p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{pendingCount}</span>
          </div>

          <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">{t('shell.wechat.manualCodeTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('shell.wechat.manualCodeDesc')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="text"
                value={manualPairingCode}
                onChange={(e) => setManualPairingCode(e.target.value.toUpperCase())}
                placeholder={t('shell.wechat.codePlaceholder')}
                className="font-mono uppercase"
                autoComplete="off"
              />
              <Button
                type="button"
                onClick={() => void handleApprove(manualPairingCode)}
                disabled={!manualPairingCode.trim() || busyKey === `approve:${manualPairingCode.trim()}`}
              >
                {busyKey === `approve:${manualPairingCode.trim()}` ? t('shell.wechat.approving') : t('shell.wechat.approveCode')}
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t('shell.wechat.loadingPending')}</p>
          ) : pendingCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground text-center">
              {t('shell.wechat.noPending')}
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((request) => (
                <article
                  key={request.code}
                  className="rounded-lg border border-border px-4 py-3 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium">
                        {request.nickname || request.wxid || t('shell.wechat.unknownSender')}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {t('shell.wechat.codeLabel')}: {request.code}
                        </span>
                        {request.wxid && (
                          <span className="font-mono">
                            {t('shell.wechat.wxidLabel')}: {request.wxid}
                          </span>
                        )}
                        <span>
                          {t('shell.wechat.requested')}: {formatTimestamp(request.createdAt, unknownTime)}
                        </span>
                        {request.expiresAt && (
                          <span>
                            {t('shell.wechat.expires')}: {formatTimestamp(request.expiresAt, unknownTime)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {request.wxid && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopy(request.wxid!)}
                        >
                          <Copy className="w-4 h-4" />
                          {t('shell.wechat.copyId')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleApprove(request.code, request.wxid)}
                        disabled={busyKey === `approve:${request.code.trim()}`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {busyKey === `approve:${request.code.trim()}` ? t('shell.wechat.approving') : t('shell.wechat.approve')}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Approved senders */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('shell.wechat.approvedTitle')}</h2>
              <p className="text-xs text-muted-foreground mt-1">{t('shell.wechat.approvedDesc')}</p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{approvedCount}</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t('shell.wechat.loadingApproved')}</p>
          ) : approvedCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground text-center">
              {t('shell.wechat.noApproved')}
            </div>
          ) : (
            <div className="space-y-3">
              {approved.map((sender) => (
                <article
                  key={sender.wxid}
                  className="rounded-lg border border-border px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{sender.wxid}</p>
                    <p className="text-xs text-muted-foreground">{t('shell.wechat.allowlistNote')}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopy(sender.wxid)}
                    >
                      <Copy className="w-4 h-4" />
                      {t('shell.wechat.copy')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRemoveApproved(sender.wxid)}
                      disabled={busyKey === `remove:${sender.wxid}`}
                    >
                      <X className="w-4 h-4" />
                      {busyKey === `remove:${sender.wxid}` ? t('shell.wechat.removing') : t('shell.wechat.remove')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </ShellLayout>
  )
}
