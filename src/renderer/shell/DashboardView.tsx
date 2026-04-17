import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  FileText,
  Settings,
  RefreshCw,
  ChevronRight,
  Wrench,
  Package,
  Key,
  Download,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GatewayStatus, GatewayStatusValue, AppVersionInfo, WeChatChannelConfig } from '../../shared/types'
import { formatMainVersion } from '@/utils/version-format'

const STATUS_COLORS: Record<GatewayStatusValue, string> = {
  starting: 'text-amber-600 dark:text-amber-400',
  running: 'text-green-600 dark:text-green-400',
  stopped: 'text-muted-foreground',
  error: 'text-destructive',
}

export interface DashboardViewProps {
  /** Navigate to Settings panel when user clicks Settings action card */
  onNavigateToSettings: () => void
  /** Navigate to LLM API management panel when user clicks LLM API action card */
  onNavigateToLlmApi?: () => void
  /** Navigate to Skills management panel */
  onNavigateToSkills?: () => void
  /** Navigate to Updates panel */
  onNavigateToUpdates?: () => void
  /** Navigate to Feishu Settings (pairing / allowlist) */
  onNavigateToFeishuSettings?: () => void
  /** Navigate to WeChat Settings (pairing / QR code / allowlist) */
  onNavigateToWeChatSettings?: () => void
  /** Whether an update is available */
  updateAvailable?: boolean
  /** Latest version string */
  updateVersion?: string
  /** Dismiss update banner */
  onDismissUpdateNotice?: () => void
}

interface ActionCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  highlight?: boolean
  comingSoonSuffix: string
  updateAvailableAria: string
}

function ActionCard({ title, description, icon, onClick, disabled, highlight, comingSoonSuffix, updateAvailableAria }: ActionCardProps) {
  const content = (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      }`}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        disabled
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
      }
      aria-label={disabled ? `${title} (${comingSoonSuffix})` : title}
    >
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0" aria-hidden>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {highlight && <span className="w-2 h-2 rounded-full bg-sky-500" aria-label={updateAvailableAria} />}
        </div>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      {!disabled && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />}
    </div>
  )
  return content
}

export function DashboardView({
  onNavigateToSettings,
  onNavigateToLlmApi,
  onNavigateToSkills,
  onNavigateToUpdates,
  onNavigateToFeishuSettings,
  onNavigateToWeChatSettings,
  updateAvailable,
  updateVersion,
  onDismissUpdateNotice,
}: DashboardViewProps) {
  const { t } = useTranslation()
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [versions, setVersions] = useState<AppVersionInfo | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [hasFeishuChannel, setHasFeishuChannel] = useState(false)
  const [hasWeChatChannel, setHasWeChatChannel] = useState(false)

  const versionLabels = useMemo(
    () =>
      (['shell', 'electron', 'node', 'openclaw'] as const).map((key) => ({
        key,
        label:
          key === 'shell'
            ? t('shell.dashboard.versionLabelShell')
            : key === 'electron'
              ? t('shell.dashboard.versionLabelElectron')
              : key === 'node'
                ? t('shell.dashboard.versionLabelNode')
                : t('shell.dashboard.versionLabelOpenclaw'),
      })),
    [t]
  )

  const statusLabels = useMemo(
    () =>
      ({
        starting: t('shell.status.starting'),
        running: t('shell.status.running'),
        stopped: t('shell.status.stopped'),
        error: t('shell.status.error'),
      }) satisfies Record<GatewayStatusValue, string>,
    [t]
  )

  const handleStatusUpdate = useCallback(
    (status: GatewayStatus) => {
      setGatewayStatus(status)
      if (status.status === 'error') {
        setLastError(t('shell.dashboard.errorHint'))
      } else {
        setLastError(null)
      }
    },
    [t]
  )

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        const status = await window.electronAPI.gatewayStatus()
        if (mounted) handleStatusUpdate(status)
      } catch {
        if (mounted) setGatewayStatus(null)
      }
    }
    void init()
    const unsub = window.electronAPI.onGatewayStatusChange((status) => {
      if (mounted) handleStatusUpdate(status)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [handleStatusUpdate])

  useEffect(() => {
    window.electronAPI.shellGetVersions().then(setVersions).catch(() => {})
  }, [])

  useEffect(() => {
    void window.electronAPI
      .configRead()
      .then((cfg) => {
        const f = cfg?.channels?.feishu
        setHasFeishuChannel(Boolean(f && (f.appId || f.appSecret)))
        const w = (cfg?.channels?.wechat ?? cfg?.channels?.['openclaw-weixin']) as WeChatChannelConfig | undefined
        setHasWeChatChannel(Boolean(w && (w.agentId || w.appSecret)))
      })
      .catch(() => {
        setHasFeishuChannel(false)
        setHasWeChatChannel(false)
      })
  }, [])

  const handleStartGateway = async () => {
    setRestarting(true)
    try {
      await window.electronAPI.gatewayStart()
    } finally {
      setRestarting(false)
    }
  }

  const handleRestartGateway = async () => {
    setRestarting(true)
    try {
      await window.electronAPI.gatewayRestart()
    } finally {
      setRestarting(false)
    }
  }

  const handleOpenLogDir = () => {
    void window.electronAPI.systemOpenLogDir()
  }

  const comingSoon = t('shell.status.comingSoon')
  const updateAria = t('shell.updates.newVersion')

  return (
    <div
      className="flex-1 overflow-y-auto p-6 animate-in fade-in duration-200"
      role="main"
      aria-label={t('shell.dashboard.mainAria')}
    >
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">{t('shell.dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('shell.dashboard.subtitle')}
          </p>
        </header>

        {updateAvailable && updateVersion && (
          <section
            className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3"
            aria-live="polite"
            role="status"
          >
            <RefreshCw className="w-4 h-4 text-primary mt-0.5" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('shell.dashboard.newUpdateAvailable')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('shell.dashboard.newUpdateBody', { version: updateVersion })}
              </p>
            </div>
            <div className="flex gap-2">
              {onNavigateToUpdates && (
                <Button size="sm" onClick={onNavigateToUpdates}>
                  {t('shell.dashboard.viewUpdates')}
                </Button>
              )}
              {onDismissUpdateNotice && (
                <Button size="sm" variant="ghost" onClick={onDismissUpdateNotice}>
                  {t('shell.dashboard.dismiss')}
                </Button>
              )}
            </div>
          </section>
        )}

        <section
          className="rounded-lg border border-border bg-card p-4"
          aria-label={t('shell.dashboard.gatewayAria')}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-medium">{t('shell.dashboard.gateway')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`text-sm font-medium ${gatewayStatus ? STATUS_COLORS[gatewayStatus.status] : 'text-muted-foreground'}`}
            >
              {gatewayStatus ? statusLabels[gatewayStatus.status] : t('shell.dashboard.loadingVersions')}
            </span>
            {gatewayStatus?.status === 'running' && gatewayStatus.port > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                {t('shell.dashboard.portLabel', { port: gatewayStatus.port })}
              </span>
            )}
            {(gatewayStatus?.status === 'stopped' || gatewayStatus?.status === 'error') && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={gatewayStatus.status === 'error' ? 'destructive' : 'default'}
                  onClick={gatewayStatus.status === 'error' ? handleRestartGateway : handleStartGateway}
                  disabled={restarting}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} aria-hidden />
                  {gatewayStatus.status === 'error' ? t('shell.dashboard.restart') : t('shell.dashboard.start')}
                </Button>
              </div>
            )}
          </div>
        </section>

        {lastError && (
          <section
            className="rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            aria-live="polite"
            role="alert"
          >
            <h2 className="text-sm font-medium text-destructive mb-1">{t('shell.dashboard.recentError')}</h2>
            <p className="text-sm text-muted-foreground">{lastError}</p>
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={handleOpenLogDir}>
                <FileText className="w-3.5 h-3.5" aria-hidden />
                {t('shell.dashboard.openLogDir')}
              </Button>
            </div>
          </section>
        )}

        <section
          className="rounded-lg border border-border bg-card p-4"
          aria-label={t('shell.dashboard.versionsAria')}
        >
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-medium">{t('shell.dashboard.versions')}</h2>
          </div>
          {versions ? (
            <>
              <p className="text-sm font-medium font-mono mb-2" aria-label={t('shell.dashboard.mainVersionAria')}>
                {formatMainVersion(versions)}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {versionLabels.map(({ key, label }) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-mono">{versions[key]}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              {t('shell.dashboard.loadingVersions')}
            </p>
          )}
        </section>

        <section aria-label={t('shell.dashboard.quickActionsAria')}>
          <h2 className="text-sm font-medium mb-3">{t('shell.dashboard.quickActions')}</h2>
          <div className="grid gap-2">
            <ActionCard
              title={t('shell.dashboard.logs')}
              description={t('shell.dashboard.logsDesc')}
              icon={<FileText className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={handleOpenLogDir}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
            <ActionCard
              title={t('shell.dashboard.diagnostics')}
              description={t('shell.dashboard.diagnosticsDesc')}
              icon={<Download className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={() => {
                void window.electronAPI.diagnosticsExport().catch(() => {})
              }}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
            <ActionCard
              title={t('shell.dashboard.settings')}
              description={t('shell.dashboard.settingsDesc')}
              icon={<Settings className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={onNavigateToSettings}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
            {hasFeishuChannel && onNavigateToFeishuSettings && (
              <ActionCard
                title={t('shell.dashboard.feishuSettings')}
                description={t('shell.dashboard.feishuSettingsDesc')}
                icon={<MessageSquare className="w-5 h-5 text-muted-foreground" aria-hidden />}
                onClick={onNavigateToFeishuSettings}
                comingSoonSuffix={comingSoon}
                updateAvailableAria={updateAria}
              />
            )}
            {hasWeChatChannel && onNavigateToWeChatSettings && (
              <ActionCard
                title={t('shell.dashboard.wechatSettings')}
                description={t('shell.dashboard.wechatSettingsDesc')}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-muted-foreground" aria-hidden>
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.87c-.135-.003-.272-.011-.407-.011zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                  </svg>
                }
                onClick={onNavigateToWeChatSettings}
                comingSoonSuffix={comingSoon}
                updateAvailableAria={updateAria}
              />
            )}
            <ActionCard
              title={t('shell.dashboard.updates')}
              description={t('shell.dashboard.updatesDesc')}
              icon={<RefreshCw className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={onNavigateToUpdates}
              disabled={!onNavigateToUpdates}
              highlight={Boolean(updateAvailable)}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
            <ActionCard
              title={t('shell.dashboard.skills')}
              description={t('shell.dashboard.skillsDesc')}
              icon={<Wrench className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={onNavigateToSkills}
              disabled={!onNavigateToSkills}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
            <ActionCard
              title={t('shell.dashboard.llmApi')}
              description={t('shell.dashboard.llmApiDesc')}
              icon={<Key className="w-5 h-5 text-muted-foreground" aria-hidden />}
              onClick={onNavigateToLlmApi}
              disabled={!onNavigateToLlmApi}
              comingSoonSuffix={comingSoon}
              updateAvailableAria={updateAria}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
