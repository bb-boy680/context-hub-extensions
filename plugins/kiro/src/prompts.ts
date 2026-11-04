import type { ExtensionIcon, Prompt, PromptForm, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { KIRO_ID } from "./locations.ts"

const rule: PromptForm = { id: "rule", labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" }
const agent: PromptForm = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" }
const instructions: PromptForm = { id: "instructions", labelKey: "kiro.menu.instructions", options: [{ id: "agents", labelKey: "kiro.menu.instructions", removeLabelKey: "kiro.menu.instructions.remove" }] }

export function createKiroPrompts(tools: PromptTools, icon: ExtensionIcon): PromptProvider {
  const places: PromptPlace[] = [
    { id: "kiro", agent: KIRO_ID, labelKey: "kiro.tab", icon, scope: "workspace", where: ".kiro", forms: [rule, agent] },
    { id: "kiro-global", agent: KIRO_ID, labelKey: "kiro.tab", icon, scope: "global", where: "~/.kiro", forms: [rule, agent, instructions] },
  ]
  const placeOf = (id: string): PromptPlace => {
    const place = places.find((item) => item.id === id)
    if (!place) throw new tools.PromptError("kiro.error.unknownPlace", { place: id })
    return place
  }
  const slugOf = (prompt: Prompt): string => {
    const slug = tools.slugOf(prompt.name)
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) throw new tools.PromptError("kiro.error.invalidName")
    return slug
  }
  const target = (place: PromptPlace, slug: string, form: string, option?: string): PromptRef => {
    const offered = place.forms.find((item) => item.id === form)
    if (!offered || (offered.options ? !offered.options.some((item) => item.id === option) : option !== undefined)) throw new tools.PromptError("kiro.error.unknownForm", { form })
    if (form === "instructions") return { scope: "global", file: ".kiro/steering/AGENTS.md" }
    return { scope: place.scope, file: `.kiro/${form === "rule" ? "steering" : "agents"}/context-hub-${slug}.md` }
  }
  const owned = (text: string, slug: string): boolean => {
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n(.*?)(?:\r?\n|$)/.exec(text)
    return match?.[1] === `<!-- context-hub:${slug} -->`
  }
  const sectionSafe = (text: string | null, slug: string, ref: PromptRef) => {
    if (text === null) return
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`
    const start = text.indexOf(open), end = text.indexOf(close)
    if ((start < 0 && end >= 0) || (start >= 0 && (end < start || text.indexOf(open, start + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0))) throw new tools.PromptError("kiro.error.conflict", { file: ref.file })
  }
  const generated = (prompt: Prompt, slug: string, form: string) => {
    const name = `context-hub-${slug}`
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
    const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n*$/, "")
    return `---\n${form === "rule" ? "inclusion: auto\n" : ""}name: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n<!-- context-hub:${slug} -->\n${body}\n`
  }
  return {
    id: KIRO_ID, places,
    async held(io, id, prompt) {
      const place = placeOf(id), slug = slugOf(prompt)
      const result: Record<string, boolean> = {}
      for (const form of place.forms) {
        const option = form.id === "instructions" ? "agents" : undefined
        const ref = target(place, slug, form.id, option)
        const text = await io.files.read(ref)
        if (form.id === "instructions") sectionSafe(text, slug, ref)
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : owned(text, slug))) result[option ? `${form.id}:${option}` : form.id] = true
      }
      return result
    },
    async install(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option)
      const existing = await io.files.read(ref)
      if (form === "instructions") {
        sectionSafe(existing, slug, ref)
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }))
      } else {
        if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("kiro.error.conflict", { file: ref.file })
        await io.files.write(ref, generated(prompt, slug, form))
      }
    },
    async remove(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option)
      const existing = await io.files.read(ref)
      if (existing === null) return false
      if (form === "instructions") {
        sectionSafe(existing, slug, ref)
        const next = tools.withoutSection(existing, slug)
        if (next === null) return false
        if (next.trim() === "") await io.files.remove(ref)
        else await io.files.write(ref, next)
      } else {
        if (!owned(existing, slug)) throw new tools.PromptError("kiro.error.conflict", { file: ref.file })
        await io.files.remove(ref)
      }
      return true
    },
  }
}
