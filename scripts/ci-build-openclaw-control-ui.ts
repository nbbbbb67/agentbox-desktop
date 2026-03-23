/**
 * CI only (Linux): build OpenClaw Control UI into build/_ci_openclaw_control_ui_root/dist/control-ui
 * for upload as a workflow artifact. Windows packaging merges this path to avoid Vite/Rolldown on win-latest.
 */

import { mkdir, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { downloadAndBuildOpenClawControlUiAt } from './ensure-openclaw-control-ui.ts'

const OUT_ROOT = join(process.cwd(), 'build', '_ci_openclaw_control_ui_root')

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const version =
    process.env.OPENCLAW_DESKTOP_BUNDLE_VERSION?.trim() ||
    execSync('npm view openclaw version', { encoding: 'utf8' }).trim()

  console.log(`\nci-build-openclaw-control-ui: OpenClaw ${version}\n`)

  await rm(OUT_ROOT, { recursive: true, force: true })
  await mkdir(OUT_ROOT, { recursive: true })

  await downloadAndBuildOpenClawControlUiAt(OUT_ROOT, version)

  const indexHtml = join(OUT_ROOT, 'dist', 'control-ui', 'index.html')
  if (!(await fileExists(indexHtml))) {
    throw new Error(`Expected ${indexHtml} after build`)
  }

  console.log(`\n  OK: Control UI at ${join(OUT_ROOT, 'dist', 'control-ui')}\n`)
}

main().catch((err) => {
  console.error(`\n  FAIL: ci-build-openclaw-control-ui: ${err.message || err}\n`)
  process.exit(1)
})
