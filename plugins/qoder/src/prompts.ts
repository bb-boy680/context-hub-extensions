import type { ExtensionIcon, Prompt, PromptIo, PromptPlace, PromptProvider, PromptRef, PromptTools } from "./contracts.ts"
import { QODER_AGENT_DIR, QODER_COMMAND_DIR, QODER_ID, QODER_INSTRUCTIONS, QODER_RULE_DIR } from "./locations.ts"

export function createQoderPrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const commands = { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" }
  const rule = { id: "rule", labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" }
  const agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" }
  const places: PromptPlace[] = [
    { id: "qoder-global", agent: QODER_ID, labelKey: "qoder.tab", icon, scope: "global", where: "~/.qoder", forms: [commands, rule, agent, { id: "instructions", labelKey: "qoder.menu.instructions", removeLabelKey: "qoder.menu.instructions.remove" }] },
    { id: "qoder", agent: QODER_ID, labelKey: "qoder.tab", icon, scope: "workspace", where: ".qoder", forms: [commands, rule, agent] },
  ]
  const fail = (key: string, params?: Record<string, string>, error?: unknown): Error => new tools.PromptError(
    `qoder.error.${key}`, params, error instanceof Error ? error.message : error === undefined ? undefined : String(error)
  )
  const placeOf = (id: string): PromptPlace => {
    const place = places.find((one) => one.id === id)
    if (place === undefined) throw fail("unknownPlace", { place: id })
    return place
  }
  const slugOf = (prompt: Prompt): string => tools.slugOf(prompt.name)
  const target = (place: PromptPlace, prompt: Prompt, form: string, option?: string): PromptRef => {
    if (option !== undefined || !place.forms.some((one) => one.id === form)) throw fail("form", { form })
    const slug = slugOf(prompt)
    const dir = form === "commands" ? QODER_COMMAND_DIR : form === "rule" ? QODER_RULE_DIR : QODER_AGENT_DIR
    return { scope: place.scope, file: form === "instructions" ? QODER_INSTRUCTIONS : `${dir}/${slug}.md` }
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
      throw fail("section", { file: QODER_INSTRUCTIONS })
    }
  }
  return {
    id: QODER_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id)
      const answer: Record<string, boolean> = {}
      for (const form of place.forms) {
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
      if (form !== "rule" && description === "") throw fail("description")
      await write(io, ref, tools.commandFile({
        name: slugOf(prompt), description, body: `${marker(prompt)}\n${prompt.prompt}`, frontmatter: form !== "rule",
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
