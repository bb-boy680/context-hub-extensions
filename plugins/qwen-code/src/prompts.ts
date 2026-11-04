import type { ExtensionIcon, Prompt, PromptForm, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { QWEN_ID } from "./locations.ts"

const forms: PromptForm[] = [
  { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" },
  { id: "skill", labelKey: "qwen-code.menu.skill", removeLabelKey: "qwen-code.menu.skill.remove" },
  { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
  { id: "instructions", labelKey: "qwen-code.menu.instructions", removeLabelKey: "qwen-code.menu.instructions.remove" },
]

export function createQwenCodePrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const places: PromptPlace[] = [
    { id: "qwen-code", agent: QWEN_ID, labelKey: "qwen-code.tab", icon, scope: "workspace", order: 20, where: ".qwen", forms },
    { id: "qwen-code-global", agent: QWEN_ID, labelKey: "qwen-code.tab", icon, scope: "global", order: 20, where: "~/.qwen", forms },
  ]
  const placeOf = (id: string): PromptPlace => {
    const place = places.find(item => item.id === id)
    if (!place) throw new tools.PromptError("qwen-code.error.unknownPlace", { place: id })
    return place
  }
  const slugOf = (prompt: Prompt): string => {
    const slug = tools.slugOf(prompt.name)
    if (!/^[\p{L}\p{N}-]+$/u.test(slug) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) {
      throw new tools.PromptError("qwen-code.error.invalidName")
    }
    return slug
  }
  const target = (place: PromptPlace, slug: string, form: string, option?: string): PromptRef => {
    if (!place.forms.some(item => item.id === form) || option !== undefined) throw new tools.PromptError("qwen-code.error.unknownForm", { form })
    if (form === "instructions") return { scope: place.scope, file: place.scope === "global" ? ".qwen/QWEN.md" : "QWEN.md" }
    if (form === "skill") return { scope: place.scope, file: `.qwen/skills/${slug}/SKILL.md` }
    return { scope: place.scope, file: `.qwen/${form === "commands" ? "commands" : "agents"}/${slug}.md` }
  }
  const owned = (text: string, slug: string): boolean => {
    const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/)
    if (lines[0] !== "---") return false
    const end = lines.findIndex((line, index) => index > 0 && line === "---")
    return end >= 0 && lines[end + 1] === `<!-- context-hub:${slug} -->`
  }
  const sectionSafe = (text: string | null, slug: string, ref: PromptRef): void => {
    if (text === null) return
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`
    const start = text.indexOf(open), end = text.indexOf(close)
    if ((start < 0 && end >= 0) || (start >= 0 && (end < start || text.indexOf(open, start + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0))) {
      throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file })
    }
  }
  const generated = (prompt: Prompt, slug: string, form: string): string => {
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
    const fields = form === "commands" ? [] : [`name: ${JSON.stringify(slug)}`]
    fields.push(`description: ${JSON.stringify(description)}`)
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false })
    return `---\n${fields.join("\n")}\n---\n<!-- context-hub:${slug} -->\n${body}`
  }
  return {
    id: QWEN_ID, places,
    async held(io, id, prompt) {
      const place = placeOf(id), slug = slugOf(prompt), result: Record<string, boolean> = {}
      for (const form of forms) {
        const ref = target(place, slug, form.id)
        const text = await io.files.read(ref)
        if (text === null) continue
        if (form.id === "instructions") {
          sectionSafe(text, slug, ref)
          if (tools.withoutSection(text, slug) !== null) result[form.id] = true
        } else if (owned(text, slug)) result[form.id] = true
      }
      return result
    },
    async install(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option)
      const text = await io.files.read(ref)
      if (form === "instructions") {
        sectionSafe(text, slug, ref)
        await io.files.write(ref, tools.withSection(text, { slug, title: prompt.name, body: prompt.prompt }))
      } else {
        if (text !== null && !owned(text, slug)) throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file })
        await io.files.write(ref, generated(prompt, slug, form))
      }
    },
    async remove(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option)
      const text = await io.files.read(ref)
      if (text === null) return false
      if (form === "instructions") {
        sectionSafe(text, slug, ref)
        const next = tools.withoutSection(text, slug)
        if (next === null) return false
        if (next.trim() === "") await io.files.remove(ref)
        else await io.files.write(ref, next)
      } else {
        if (!owned(text, slug)) throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file })
        await io.files.remove(ref)
      }
      return true
    },
  }
}
