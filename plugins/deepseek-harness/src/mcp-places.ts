import type { McpIo, McpPlace, McpRef, McpTools } from "./contracts.ts"

const ROOT = { home: ".dsh", homeEnv: "DSH_HOME", list: ["profiles", "profiles/*/node_modules", "profiles/*/node_modules/*"] } as const
export const HOME_PLACE: McpPlace = {
  id: "deepseek-harness-home", label: "DeepSeek Harness · cordis.patch.yml",
  scope: "global", file: "cordis.patch.yml", root: ROOT, switchable: true, installable: true,
}

function ref(file: string, rootIdentity: string): McpRef {
  return { scope: "global", file, root: ROOT, rootIdentity }
}

function validProfile(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && name !== "node_modules" &&
    !name.includes("/") && !name.includes("\\") && !name.includes(":")
}

export function profileId(name: string): string {
  return `deepseek-harness-profile-${Array.from(new TextEncoder().encode(name), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

export function profileManifest(text: string | null): boolean {
  if (text === null) return false
  let value: unknown
  try { value = JSON.parse(text) } catch { return false }
  if (typeof value !== "object" || value === null) return false
  const dsh = (value as { dsh?: { profile?: { bundles?: unknown } } }).dsh
  const bundles = dsh?.profile?.bundles
  return Array.isArray(bundles) && bundles.every((bundle) => typeof bundle === "string" && bundle.trim() !== "")
}

export async function mcpPlaces(io: McpIo, tools: McpTools, expectedRoot?: string): Promise<McpPlace[]> {
  if (io.files.list === undefined || io.files.snapshot === undefined) throw new tools.McpError("deepseekHarness.error.unsupported")
  const home = expectedRoot === undefined ? HOME_PLACE : { ...HOME_PLACE, rootIdentity: expectedRoot }
  const rootIdentity = (await io.files.snapshot(home)).root
  const names = await io.files.list(ref("profiles", rootIdentity))
  const profiles: McpPlace[] = []
  for (const name of names) {
    if (!validProfile(name)) continue
    if (!profileManifest(await io.files.read(ref(`profiles/${name}/package.json`, rootIdentity)))) continue
    profiles.push({
      id: profileId(name), label: `DeepSeek Harness · ${name}`, scope: "global",
      file: `profiles/${name}/cordis.patch.yml`, root: ROOT, rootIdentity, switchable: true, installable: false,
    })
  }
  return [{ ...HOME_PLACE, rootIdentity }, ...profiles]
}
