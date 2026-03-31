/**
 * OpenClaw Feishu channel: `registerFull` re-runs on every inbound dispatch when
 * `api.registrationMode === "full"`, re-registering tools and spamming logs.
 * Guard once per process via globalThis (gateway child is one Node process).
 *
 * Upstream layouts:
 * - Older: dedicated `dist/feishu-*.js` chunks.
 * - Newer (e.g. 2026.3.28+): Feishu plugin code lives inside hashed `dist/auth-profiles-*.js` bundles.
 *
 * Idempotent: safe to run after every download-openclaw / prepare-bundle.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const GUARD_FLAG = '__openclawDesktopFeishuFullRegistered'

/** Matches `registerFull(api) { … registerFeishuSubagentHooks(api); … }` entry (first statement after `{`). */
const REGISTER_FULL_FEISHU_RE =
  /(registerFull\(api\)\s*\{)(\s*)(registerFeishuSubagentHooks\(api\);)/

async function tryPatchFeishuRegisterFullFile(
  filePath: string,
  label: string,
): Promise<boolean> {
  let raw = await readFile(filePath, 'utf8')
  if (raw.includes(GUARD_FLAG)) return false
  if (!raw.includes('registerFeishuSubagentHooks')) return false
  if (!REGISTER_FULL_FEISHU_RE.test(raw)) return false
  raw = raw.replace(REGISTER_FULL_FEISHU_RE, (_m, p1: string, p2: string, p3: string) => {
    return `${p1}${p2}if(globalThis.${GUARD_FLAG})return;globalThis.${GUARD_FLAG}=!0;${p3}`
  })
  await writeFile(filePath, raw, 'utf8')
  console.log(`  [patch-feishu] ${label}: registerFull guarded (once per process)`)
  return true
}

export async function patchOpenClawFeishuRegisterOnce(openclawRoot: string): Promise<void> {
  const dist = join(openclawRoot, 'dist')
  let names: string[]
  try {
    names = await readdir(dist)
  } catch {
    return
  }

  const candidates = names.filter(
    (n) => /^feishu-.*\.js$/.test(n) || /^auth-profiles-.*\.js$/.test(n),
  )

  let patched = false
  for (const name of candidates) {
    const ok = await tryPatchFeishuRegisterFullFile(join(dist, name), name)
    if (ok) patched = true
  }

  if (!patched && candidates.length > 0) {
    let hasGuard = false
    let patternStillUnpatched = false
    for (const name of candidates) {
      const raw = await readFile(join(dist, name), 'utf8')
      if (raw.includes(GUARD_FLAG)) hasGuard = true
      if (
        raw.includes('registerFeishuSubagentHooks') &&
        REGISTER_FULL_FEISHU_RE.test(raw)
      ) {
        patternStillUnpatched = true
      }
    }
    if (patternStillUnpatched) {
      console.warn(
        '  [patch-feishu] registerFull+registerFeishuSubagentHooks pattern still present but patch did not apply',
      )
    } else if (!hasGuard) {
      console.warn(
        '  [patch-feishu] Feishu/auth-profiles chunks present but registerFull+registerFeishuSubagentHooks pattern not found — upstream layout may have changed',
      )
    }
  }
}
