import type { ExtensionIcon, Prompt, PromptIo, PromptProvider, PromptTools } from "./contracts.ts"
import { IDE_ID, IDE_RULES } from "./locations.ts"

const PLACE = "trae-ide-rules"
const FORM = "rule"

function owned(text: string, slug: string): boolean {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return false
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  return end > 0 && lines.slice(end + 1).find((line) => line.trim() !== "") === `<!-- context-hub:${slug} -->`
}

export function createTraeIdePrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const refOf = (place: string, prompt: Prompt, form = FORM, option?: string) => {
    if (place !== PLACE) throw new tools.PromptError("trae.error.unknownPlace", { place })
    if (form !== FORM || option !== undefined) throw new tools.PromptError("trae.error.unknownForm", { form })
    if (/[\\/]/.test(prompt.name) || /^\.*$/.test(prompt.name.trim()) || /^[a-z]:/i.test(prompt.name)) {
      throw new tools.PromptError("trae.error.name", { name: prompt.name })
    }
    const slug = tools.slugOf(prompt.name)
    return { slug, ref: { scope: "workspace" as const, file: `${IDE_RULES}/${slug}.md` } }
  }
  const fileOf = (prompt: Prompt, slug: string) => {
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
    const scalar = JSON.stringify(description.replace(/\s+/g, " ").trim())
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false })
    return `---\nalwaysApply: false\ndescription: ${scalar}\n---\n\n<!-- context-hub:${slug} -->\n${body}`
  }
  return {
    id: IDE_ID,
    places: [{ id: PLACE, agent: IDE_ID, labelKey: "trae.ide", icon, scope: "workspace", where: IDE_RULES,
      forms: [{ id: FORM, labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" }] }],
    async held(io: PromptIo, place, prompt): Promise<Readonly<Record<string, boolean>>> {
      const { slug, ref } = refOf(place, prompt)
      const text = await io.files.read(ref)
      return text !== null && owned(text, slug) ? { rule: true } : {}
    },
    async install(io, place, prompt, form, option) {
      const { slug, ref } = refOf(place, prompt, form, option)
      const existing = await io.files.read(ref)
      if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("trae.error.handwritten", { file: ref.file })
      const next = fileOf(prompt, slug)
      if (existing !== next) await io.files.write(ref, next)
    },
    async remove(io, place, prompt, form, option) {
      const { slug, ref } = refOf(place, prompt, form, option)
      const existing = await io.files.read(ref)
      if (existing === null || !owned(existing, slug)) return false
      await io.files.remove(ref)
      return true
    },
  }
}
