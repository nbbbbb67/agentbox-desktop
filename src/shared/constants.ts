/**
 * Shared constants — main and renderer.
 * Path layout matches upstream OpenClaw conventions.
 */

/** Default gateway listen port */
export const DEFAULT_GATEWAY_PORT = 18789

/** OpenClaw state directory under %USERPROFILE% */
export const OPENCLAW_USER_DIR = '.openclaw'

/** Shell product name (under %APPDATA%) */
export const APP_NAME = 'AgentBox'

/** WeChat channel identifier */
export const WECHAT_CHANNEL_ID = 'openclaw-weixin'

/** WeChat QR code refresh interval (ms) */
export const WECHAT_QR_REFRESH_INTERVAL_MS = 30_000

/** Main OpenClaw config filename */
export const OPENCLAW_CONFIG_FILE = 'openclaw.json'

/** Shell config file relative to app.getPath('userData') */
export const SHELL_CONFIG_FILE = 'config.json'
