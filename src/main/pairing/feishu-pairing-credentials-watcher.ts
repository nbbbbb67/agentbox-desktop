import fs from 'node:fs'
import path from 'node:path'
import { getUserDataDir } from '../utils/paths.js'

const CREDENTIALS_SUBDIR = 'credentials'
/** Debounce rapid writes (save + rename) and multi-platform double events */
const DEBOUNCE_MS = 400

function isFeishuPairingJsonFilename(filename: string | null): boolean {
  if (!filename) return false
  const lower = filename.toLowerCase()
  if (!lower.endsWith('.json')) return false
  return lower.includes('pairing')
}

/**
 * Watch `~/.openclaw/credentials` for Feishu pairing store files (`*pairing*.json`).
 * Invokes `onChange` after writes settle — no polling loop.
 */
export function watchFeishuPairingCredentialsDir(onChange: () => void): () => void {
  const dir = path.join(getUserDataDir(), CREDENTIALS_SUBDIR)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // If mkdir fails, still try watch (caller may handle empty pending)
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onChange()
    }, DEBOUNCE_MS)
  }

  let watcher: fs.FSWatcher | null = null
  try {
    watcher = fs.watch(dir, (_event, filename) => {
      // Some platforms emit with null filename — still worth one debounced read
      if (filename != null && !isFeishuPairingJsonFilename(filename)) return
      schedule()
    })
  } catch {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    try {
      watcher?.close()
    } catch {
      // ignore
    }
    watcher = null
  }
}
