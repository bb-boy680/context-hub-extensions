/**
 * Generate marketplace.json from marketplace.yaml and each plugin's
 * plugin.yaml + package.json.
 *
 * The index is a build product: the hub reads it from this repository, and a
 * hand edit would be overwritten by the next build. Reading the same fields
 * the hub validates is deliberate — a package that cannot be published fails
 * here, in the repository that owns it, rather than at someone's install.
 *
 * Environment overrides, for local verification only:
 *   MARKETPLACE_REPOSITORY  replaces marketplace.yaml's repository
 *   MARKETPLACE_OUT         writes the index somewhere other than the root
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { CORE_SCHEMA, load } from "js-yaml"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGINS = path.join(ROOT, "plugins")
const CONFIG = path.join(ROOT, "marketplace.yaml")
const OUT = path.resolve(process.env.MARKETPLACE_OUT ?? path.join(ROOT, "marketplace.json"))

/* Must stay in step with packages/core/src/extension-manifest.ts in the hub. */
const CATEGORIES = new Set([
  "agent",
  "asset",
  "integration",
  "language",
  "appearance",
  "source",
  "storage",
])
const PERMISSIONS = new Set([
  "storage.self",
  "assets.read",
  "assets.write",
  "filesystem",
  "network",
])

const LOCALE = /^[a-z]{2,8}(-[a-z0-9]{1,8})*$/
const ICON_LIMIT = 32 * 1024
const IMAGES = new Map([
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
])

function fail(message) {
  throw new Error(`build-marketplace: ${message}`)
}

function object(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field} must be an object`)
  }
  return value
}

function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a non-empty string`)
  }
  return value
}

function localized(value, field) {
  if (typeof value === "string") return text(value, field)
  const table = object(value, field)
  let english = false
  for (const [locale, message] of Object.entries(table)) {
    if (!LOCALE.test(locale)) fail(`${field}.${locale} is not a locale id`)
    text(message, `${field}.${locale}`)
    if (locale === "en") english = true
  }
  if (!english) fail(`${field} must include "en"`)
  return table
}

async function yaml(file) {
  let raw
  try {
    raw = await fs.readFile(file, "utf8")
  } catch {
    fail(`there is no ${path.relative(ROOT, file)}`)
  }
  try {
    return load(raw, { schema: CORE_SCHEMA })
  } catch (error) {
    fail(`${path.relative(ROOT, file)} is not valid YAML: ${error.message}`)
  }
}

async function packageFile(pluginDir, id) {
  const file = path.join(pluginDir, "package.json")
  let raw
  try {
    raw = await fs.readFile(file, "utf8")
  } catch {
    fail(`plugin "${id}" has no package.json`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(`plugin "${id}": package.json is not JSON`)
  }
  const pkg = object(parsed, `plugin "${id}" package.json`)
  const version = text(pkg.version, `plugin "${id}" package.json.version`)
  const main =
    pkg.main === undefined
      ? "index.js"
      : text(pkg.main, `plugin "${id}" package.json.main`)
  const entry = path.join(pluginDir, ...main.split("/"))
  const stat = await fs.stat(entry).catch(() => null)
  if (stat === null || !stat.isFile()) {
    fail(`plugin "${id}" declares main "${main}", but the file is missing`)
  }
  return { version, main }
}

function iconPath(value, pluginDir, id) {
  const icon = text(value, `plugin "${id}" icon`)
  if (icon.startsWith("/") || icon.includes("\\")) {
    fail(`plugin "${id}" icon must be a relative POSIX path`)
  }
  const segments = icon.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(`plugin "${id}" icon contains an unusable segment`)
  }
  const mime = IMAGES.get(path.extname(icon).toLowerCase())
  if (mime === undefined) {
    fail(
      `plugin "${id}" icon must be an image path (${[...IMAGES.keys()].join(", ")}), not a lucide name or URL`
    )
  }
  return { file: path.join(pluginDir, ...segments), mime }
}

async function iconDataUrl(value, pluginDir, id) {
  const { file, mime } = iconPath(value, pluginDir, id)
  const stat = await fs.stat(file).catch(() => null)
  if (stat === null || !stat.isFile()) {
    fail(`plugin "${id}" icon "${value}" is missing`)
  }
  if (stat.size > ICON_LIMIT) {
    fail(`plugin "${id}" icon is larger than ${String(ICON_LIMIT)} bytes`)
  }
  const bytes = await fs.readFile(file)
  return `data:${mime};base64,${bytes.toString("base64")}`
}

function repository(value) {
  const url = text(value, "marketplace.yaml repository")
  if (/^[A-Za-z]:[\\/]/.test(url) || url.startsWith("/") || url.startsWith("\\\\")) {
    return url.replace(/\\/g, "/").replace(/\/+$/, "")
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    fail("marketplace.yaml repository is not a URL")
  }
  if (parsed.protocol !== "https:") fail("marketplace.yaml repository must use https")
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("marketplace.yaml repository must not carry credentials, a query or a fragment")
  }
  return url.replace(/\/+$/, "")
}

async function pluginEntry(dir, defaults) {
  const pluginDir = path.join(PLUGINS, dir)
  const manifest = object(await yaml(path.join(pluginDir, "plugin.yaml")), `${dir} plugin.yaml`)
  if (manifest.id !== dir) {
    fail(`plugin "${dir}" declares id "${String(manifest.id)}"; it must equal its directory`)
  }
  if (manifest.version !== undefined) {
    fail(`plugin "${dir}" declares version in plugin.yaml; it belongs in package.json`)
  }
  if (manifest.entry !== undefined) {
    fail(`plugin "${dir}" declares entry in plugin.yaml; it belongs in package.json main`)
  }
  const apiVersion = text(manifest.apiVersion, `plugin "${dir}" apiVersion`)
  const pkg = await packageFile(pluginDir, dir)
  const author =
    manifest.author === undefined
      ? defaults.author
      : text(manifest.author, `plugin "${dir}" author`)

  if (manifest.category !== undefined && !CATEGORIES.has(manifest.category)) {
    fail(`plugin "${dir}" has unknown category "${String(manifest.category)}"`)
  }
  if (manifest.permissions !== undefined) {
    if (
      !Array.isArray(manifest.permissions) ||
      !manifest.permissions.every((item) => PERMISSIONS.has(item))
    ) {
      fail(`plugin "${dir}" permissions must list known permissions`)
    }
  }

  return {
    id: dir,
    title: localized(manifest.name, `plugin "${dir}" name`),
    description: localized(manifest.description, `plugin "${dir}" description`),
    icon: await iconDataUrl(manifest.icon, pluginDir, dir),
    author,
    ...(manifest.category === undefined ? {} : { category: manifest.category }),
    ...(manifest.permissions === undefined ? {} : { permissions: manifest.permissions }),
    versions: [
      {
        version: pkg.version,
        apiVersion,
        source: {
          type: "git",
          url: defaults.repository,
          path: `plugins/${dir}`,
        },
      },
    ],
  }
}

async function main() {
  const config = object(await yaml(CONFIG), "marketplace.yaml")
  const defaults = {
    author: text(config.author, "marketplace.yaml author"),
    repository: repository(process.env.MARKETPLACE_REPOSITORY ?? config.repository),
  }
  const title = localized(config.title, "marketplace.yaml title")
  const description =
    config.description === undefined
      ? undefined
      : localized(config.description, "marketplace.yaml description")

  const entries = await fs.readdir(PLUGINS, { withFileTypes: true }).catch(() => null)
  if (entries === null) fail("there is no plugins directory")
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const plugins = []
  for (const dir of dirs) {
    plugins.push(await pluginEntry(dir, defaults))
  }
  plugins.sort((left, right) => left.id.localeCompare(right.id))

  const index = {
    format: 1,
    title,
    ...(description === undefined ? {} : { description }),
    plugins,
  }
  await fs.writeFile(OUT, `${JSON.stringify(index, null, 2)}\n`)
  console.log(
    `wrote ${path.relative(ROOT, OUT)} (${String(plugins.length)} plugin${plugins.length === 1 ? "" : "s"})`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
