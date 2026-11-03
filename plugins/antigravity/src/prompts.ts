import type { ExtensionIcon, Prompt, PromptForm, PromptIo, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { ANTIGRAVITY_ID } from "./locations.ts"

const rule: PromptForm = { id: "rule", labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" }
const globalForms: PromptForm[] = [
  { id: "skill", labelKey: "antigravity.menu.skill", removeLabelKey: "antigravity.menu.skill.remove" },
  rule,
  { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
  { id: "instructions", labelKey: "antigravity.menu.instructions", options: [{ id: "memory", labelKey: "antigravity.menu.instructions", removeLabelKey: "antigravity.menu.instructions.remove" }] },
]

export function createAntigravityPrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const places: PromptPlace[] = [
    { id: "antigravity-global", agent: ANTIGRAVITY_ID, labelKey: "antigravity.tab", icon, scope: "global", order: 20, where: "~/.gemini", forms: globalForms },
    { id: "antigravity", agent: ANTIGRAVITY_ID, labelKey: "antigravity.tab", icon, scope: "workspace", order: 20, where: ".agents", forms: [rule] },
  ]
  const placeOf = (id: string): PromptPlace => {
    const place = places.find((one) => one.id === id)
    if (!place) throw new tools.PromptError("antigravity.error.unknownPlace", { place: id })
    return place
  }
  const target = (place: PromptPlace, prompt: Prompt, form: string, option?: string): PromptRef => {
    const offered = place.forms.find((one) => one.id === form)
    if (!offered || (offered.options ? !offered.options.some((one) => one.id === option) : option !== undefined)) throw new tools.PromptError("antigravity.error.unknownForm", { form })
    const slug = tools.slugOf(prompt.name)
    if (form === "instructions") return { scope: "global", file: ".gemini/AGENTS.md" }
    const base = place.scope === "global" ? ".gemini/config" : ".agents"
    if (form === "skill") return { scope: place.scope, file: `${base}/skills/${slug}/SKILL.md` }
    if (form === "agent") return { scope: place.scope, file: `${base}/agents/${slug}.md` }
    return { scope: place.scope, file: `${base}/rules/context-hub-${slug}.md` }
  }
  const owned = (text: string, slug: string): boolean => {
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n(.*?)(?:\r?\n|$)/.exec(text)
    return match?.[1] === `<!-- context-hub:${slug} -->`
  }
  const sectionSafe = (text: string | null, slug: string, ref: PromptRef) => {
    if (text === null) return
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`
    const first = text.indexOf(open), end = text.indexOf(close)
    if ((first < 0 && end >= 0) || (first >= 0 && (end < first || text.indexOf(open, first + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0))) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file })
  }
  const checkSize = (text: string, ref: PromptRef) => {
    if (new TextEncoder().encode(text).length > 24000) throw new tools.PromptError("antigravity.error.tooLarge", { file: ref.file })
  }
  const generated = (prompt: Prompt, form: string): string => {
    const slug = tools.slugOf(prompt.name)
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
    const fields = form === "rule" ? `trigger: model_decision\ndescription: ${JSON.stringify(description)}` : `name: ${JSON.stringify(prompt.name)}\ndescription: ${JSON.stringify(description)}`
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false })
    return `---\n${fields}\n---\n<!-- context-hub:${slug} -->\n${body}`
  }
  return {
    id: ANTIGRAVITY_ID, places,
    async held(io, id, prompt) {
      const place = placeOf(id)
      const slug = tools.slugOf(prompt.name)
      const result: Record<string, boolean> = {}
      for (const form of place.forms) {
        const option = form.id === "instructions" ? "memory" : undefined
        const text = await io.files.read(target(place, prompt, form.id, option))
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : owned(text, slug))) result[option ? `${form.id}:${option}` : form.id] = true
      }
      return result
    },
    async install(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option)
      const slug = tools.slugOf(prompt.name)
      const existing = await io.files.read(ref)
      if (form === "instructions") {
        sectionSafe(existing, slug, ref)
        const next = tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt })
        checkSize(next, ref)
        await io.files.write(ref, next)
        return
      }
      if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file })
      const next = generated(prompt, form)
      if (form === "rule") checkSize(next, ref)
      await io.files.write(ref, next)
    },
    async remove(io: PromptIo, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option)
      const slug = tools.slugOf(prompt.name)
      const existing = await io.files.read(ref)
      if (existing === null) return false
      if (form === "instructions") {
        sectionSafe(existing, slug, ref)
        const next = tools.withoutSection(existing, slug)
        if (next === null) return false
        if (next.trim() === "") await io.files.remove(ref)
        else await io.files.write(ref, next)
        return true
      }
      if (!owned(existing, slug)) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file })
      await io.files.remove(ref)
      return true
    },
  }
}
