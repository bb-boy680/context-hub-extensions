import type { ExtensionIcon, Prompt, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { COPILOT_ID } from "./locations.ts"

export function createCopilotPrompts(tools: PromptTools, icon: ExtensionIcon): PromptProvider {
  const forms = [
    { id: "instructions", labelKey: "copilot.menu.instructions" },
    { id: "rule", labelKey: "copilot.menu.rule" },
    { id: "agent", labelKey: "prompts.menu.agent" },
  ]
  const places: PromptPlace[] = [
    { id: "copilot-prompts", agent: COPILOT_ID, labelKey: "copilot.tab", icon, scope: "workspace", order: 20, where: ".github", forms },
    { id: "copilot-prompts-global", agent: COPILOT_ID, labelKey: "copilot.tab", icon, scope: "global", order: 20, where: "~/.copilot", forms },
    { id: "copilot-prompts-vscode", agent: COPILOT_ID, labelKey: "copilot.vscode", icon, scope: "workspace", order: 21, where: ".github/prompts", forms: [{ id: "commands", labelKey: "prompts.menu.commands" }] },
  ]
  const placeOf = (id: string) => {
    const place = places.find((p) => p.id === id)
    if (!place) throw new tools.PromptError("copilot.error.unknownPlace", { place: id })
    return place
  }
  const target = (place: PromptPlace, prompt: Prompt, form: string, option?: string): PromptRef => {
    if (option !== undefined || !place.forms.some((f) => f.id === form)) throw new tools.PromptError("copilot.error.unknownForm", { form })
    const root = place.scope === "global" ? ".copilot" : ".github"
    const slug = tools.slugOf(prompt.name)
    const path = form === "instructions" ? "copilot-instructions.md" : form === "rule" ? `instructions/${slug}.instructions.md` : form === "agent" ? `agents/${slug}.agent.md` : `prompts/${slug}.prompt.md`
    return { scope: place.scope, file: `${root}/${path}` }
  }
  const marker = (slug: string) => `<!-- context-hub:${slug} -->`
  const checkSection = (text: string | null, slug: string, file: string) => {
    const open = text?.indexOf(marker(slug)) ?? -1
    if (open >= 0 && text!.indexOf(`<!-- /context-hub:${slug} -->`, open) < 0) throw new tools.PromptError("copilot.error.fileExists", { file })
  }
  return {
    id: COPILOT_ID, places,
    async held(io, id, prompt) {
      const place = placeOf(id), result: Record<string, boolean> = {}, slug = tools.slugOf(prompt.name)
      for (const form of place.forms) {
        const text = await io.files.read(target(place, prompt, form.id))
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : text.includes(marker(slug)))) result[form.id] = true
      }
      return result
    },
    async install(io, id, prompt, form, option) {
      const place = placeOf(id), ref = target(place, prompt, form, option), slug = tools.slugOf(prompt.name)
      const existing = await io.files.read(ref)
      if (form === "instructions") {
        checkSection(existing, slug, ref.file)
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }))
        return
      }
      if (existing !== null && !existing.includes(marker(slug))) throw new tools.PromptError("copilot.error.fileExists", { file: ref.file })
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
      const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "")
      const yaml = form === "rule" ? `description: ${JSON.stringify(description)}\napplyTo: "**"` : `name: ${JSON.stringify(prompt.name)}\ndescription: ${JSON.stringify(description)}`
      await io.files.write(ref, `---\n${yaml}\n---\n${marker(slug)}\n\n${body}\n`)
    },
    async remove(io, id, prompt, form, option) {
      const place = placeOf(id), ref = target(place, prompt, form, option), slug = tools.slugOf(prompt.name)
      const existing = await io.files.read(ref)
      if (existing === null) return false
      if (form === "instructions") {
        checkSection(existing, slug, ref.file)
        const next = tools.withoutSection(existing, slug)
        if (next === null) return false
        if (next.trim()) await io.files.write(ref, next); else await io.files.remove(ref)
      } else {
        if (!existing.includes(marker(slug))) return false
        await io.files.remove(ref)
      }
      return true
    },
  }
}
