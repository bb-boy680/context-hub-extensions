import type { ExtensionIcon, Prompt, PromptIo, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { ZCODE_AGENT_DIR, ZCODE_COMMAND_DIR, ZCODE_ID, ZCODE_INSTRUCTIONS } from "./locations.ts"

export function createZCodePrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const commands = { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" }
  const agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" }
  const places: PromptPlace[] = [
    { id: "zcode-global", agent: ZCODE_ID, labelKey: "zcode.tab", icon, scope: "global", order: 20, where: "~/.zcode", forms: [commands, agent, { id: "instructions", labelKey: "zcode.menu.instructions", removeLabelKey: "zcode.menu.instructions.remove" }] },
    { id: "zcode", agent: ZCODE_ID, labelKey: "zcode.tab", icon, scope: "workspace", order: 20, where: ".zcode", forms: [commands, agent] },
  ]
  const fail = (key: string, params?: Record<string, string>, failure?: unknown): Error => new tools.PromptError(
    `zcode.error.${key}`, params, failure instanceof Error ? failure.message : failure === undefined ? undefined : String(failure)
  )
  const placeOf = (id: string): PromptPlace => {
    const place = places.find((one) => one.id === id)
    if (place === undefined) throw fail("unknownPlace", { place: id })
    return place
  }
  const slugOf = (prompt: Prompt): string => {
    const normalized = prompt.name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")
    if (normalized.length > 64 || /[\\/]/.test(prompt.name)) throw fail("slug", { name: prompt.name })
    const slug = tools.slugOf(prompt.name)
    if (!/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(slug)) throw fail("slug", { name: prompt.name })
    return slug
  }
  const target = (place: PromptPlace, prompt: Prompt, form: string, option?: string): PromptRef => {
    if (option !== undefined || !place.forms.some((one) => one.id === form)) throw fail("form", { form })
    const slug = slugOf(prompt)
    if (form === "agent" && ["general-purpose", "explore"].includes(slug)) throw fail("reserved", { name: slug })
    return { scope: place.scope, file: form === "instructions" ? ZCODE_INSTRUCTIONS : `${form === "commands" ? ZCODE_COMMAND_DIR : ZCODE_AGENT_DIR}/${slug}.md` }
  }
  const read = async (io: PromptIo, ref: PromptRef): Promise<string | null> => {
    try { return await io.files.read(ref) } catch (error) { throw fail("refused", { file: ref.file }, error) }
  }
  const write = async (io: PromptIo, ref: PromptRef, text: string | null): Promise<void> => {
    try {
      if (text === null) await io.files.remove(ref)
      else await io.files.write(ref, text)
    } catch (error) { throw fail("refused", { file: ref.file }, error) }
  }
  const marker = (prompt: Prompt) => `<!-- context-hub:${slugOf(prompt)} -->`
  const owned = (text: string, prompt: Prompt): boolean => text.split(/\r?\n/).includes(marker(prompt))
  const sectionCheck = (text: string | null, prompt: Prompt): void => {
    if (text === null) return
    const opening = marker(prompt)
    const closing = `<!-- /context-hub:${slugOf(prompt)} -->`
    const open = text.split(opening).length - 1
    const close = text.split(closing).length - 1
    if (open !== close || open > 1 || (open === 1 && text.indexOf(closing) < text.indexOf(opening))) {
      throw fail("section", { file: ZCODE_INSTRUCTIONS })
    }
  }
  return {
    id: ZCODE_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id)
      const answer: Record<string, boolean> = {}
      for (const form of place.forms) {
        if (form.id === "agent" && ["general-purpose", "explore"].includes(slugOf(prompt))) continue
        const ref = target(place, prompt, form.id)
        const text = await read(io, ref)
        if (form.id === "instructions") sectionCheck(text, prompt)
        if (text !== null && owned(text, prompt)) answer[form.id] = true
      }
      return answer
    },
    async install(io, id, prompt, form, option) {
      const place = placeOf(id)
      const ref = target(place, prompt, form, option)
      const text = await read(io, ref)
      if (form === "instructions") {
        sectionCheck(text, prompt)
        await write(io, ref, tools.withSection(text, { slug: slugOf(prompt), title: prompt.name, body: prompt.prompt }))
        return
      }
      if (text !== null && !owned(text, prompt)) throw fail("handwritten", { file: ref.file })
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt).trim() || prompt.name.trim()
      if (description === "") throw fail("description")
      await write(io, ref, tools.commandFile({
        name: slugOf(prompt), description, body: `${marker(prompt)}\n${prompt.prompt}`, frontmatter: true,
      }))
    },
    async remove(io, id, prompt, form, option) {
      const place = placeOf(id)
      const ref = target(place, prompt, form, option)
      const text = await read(io, ref)
      if (text === null) return false
      if (form === "instructions") {
        sectionCheck(text, prompt)
        const next = tools.withoutSection(text, slugOf(prompt))
        if (next === null) return false
        await write(io, ref, next.trim() === "" ? null : next)
        return true
      }
      if (!owned(text, prompt)) throw fail("handwritten", { file: ref.file })
      await write(io, ref, null)
      return true
    },
  }
}
