import type { ExtensionIcon, Prompt, PromptIo, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { CURSOR_ID } from "./locations.ts"

export function createCursorPrompts(tools: PromptTools, icon: ExtensionIcon): PromptProvider {
  const agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" }
  const places: PromptPlace[] = [
    { id: "cursor", agent: CURSOR_ID, labelKey: "cursor.tab", icon, scope: "workspace", order: 20, where: ".cursor", forms: [
      { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" },
      { id: "rule", labelKey: "cursor.menu.rule", removeLabelKey: "cursor.menu.rule.remove" }, agent,
    ] },
    { id: "cursor-global", agent: CURSOR_ID, labelKey: "cursor.tab", icon, scope: "global", order: 20, where: "~/.cursor", forms: [agent] },
  ]
  const placeOf = (id: string) => {
    const place = places.find((item) => item.id === id)
    if (!place) throw new tools.PromptError("cursor.error.unknownPlace", { place: id })
    return place
  }
  const target = (place: PromptPlace, prompt: Prompt, form: string, option?: string): PromptRef => {
    if (option !== undefined || !place.forms.some((item) => item.id === form)) {
      throw new tools.PromptError("cursor.error.unknownForm", { form: option === undefined ? form : `${form}:${option}` })
    }
    const slug = tools.slugOf(prompt.name)
    if (!slug || slug.startsWith(".") || /[\\/<>:"|?*]/.test(slug) || [...slug].some((char) => char.codePointAt(0)! < 32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(slug)) {
      throw new tools.PromptError("cursor.error.unknownForm", { form })
    }
    const suffix = form === "rule" ? `rules/${slug}.mdc` : form === "commands" ? `commands/${slug}.md` : `agents/${slug}.md`
    return { scope: place.scope, file: `.cursor/${suffix}` }
  }
  const marker = (prompt: Prompt) => `<!-- context-hub:${tools.slugOf(prompt.name)} -->`
  const owns = (text: string | null, prompt: Prompt) => {
    if (text === null) return false
    const end = text.indexOf("\n---\n", 4)
    return text.startsWith("---\n") && end >= 0 && text.slice(end + 5).trimStart().startsWith(`${marker(prompt)}\n`)
  }
  const read = async (io: PromptIo, ref: PromptRef) => {
    try { return await io.files.read(ref) }
    catch (error) { throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error)) }
  }
  return {
    id: CURSOR_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id)
      const result: Record<string, boolean> = {}
      for (const form of place.forms) {
        if (owns(await read(io, target(place, prompt, form.id)), prompt)) result[form.id] = true
      }
      return result
    },
    async install(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option)
      const existing = await read(io, ref)
      if (existing !== null && !owns(existing, prompt)) throw new tools.PromptError("cursor.error.exists", { file: ref.file })
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name
      const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "")
      const raw = form === "rule"
        ? `---\ndescription: ${JSON.stringify(description)}\nalwaysApply: false\n---\n\n${body}\n`
        : tools.commandFile({ name: tools.slugOf(prompt.name), description, body, frontmatter: true })
      const end = raw.indexOf("\n---\n", 4)
      if (end < 0) throw new tools.PromptError("cursor.error.refused", { file: ref.file }, "Missing frontmatter")
      const text = `${raw.slice(0, end + 5)}\n${marker(prompt)}\n${raw.slice(end + 5).trimStart()}`
      try { await io.files.write(ref, text) }
      catch (error) { throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error)) }
    },
    async remove(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option)
      if (!owns(await read(io, ref), prompt)) return false
      try { await io.files.remove(ref) }
      catch (error) { throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error)) }
      return true
    },
  }
}
