import type { ExtensionIcon, Prompt, PromptPlace, PromptProvider, PromptTools } from "./contracts.ts"
import { KIMI_AGENT_DIR, KIMI_CODE_ID, KIMI_INSTRUCTION_FILE } from "./locations.ts"

function broken(text: string, slug: string): boolean {
  const open = `<!-- context-hub:${slug} -->`
  const close = `<!-- /context-hub:${slug} -->`
  const a = text.indexOf(open), b = text.indexOf(close)
  return (a !== -1 || b !== -1) && (a < 0 || b < a || text.indexOf(open, a + open.length) >= 0 || text.indexOf(close, b + close.length) >= 0)
}

export function createKimiPrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  const forms = [
    { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
    { id: "instructions", labelKey: "kimi.menu.instructions", removeLabelKey: "kimi.menu.instructions.remove" },
  ]
  const places: PromptPlace[] = [
    { id: "kimi-global", agent: KIMI_CODE_ID, labelKey: "kimi.tab", icon, scope: "global", order: 20, where: "~/.kimi-code", forms },
    { id: "kimi", agent: KIMI_CODE_ID, labelKey: "kimi.tab", icon, scope: "workspace", order: 20, where: ".kimi-code", forms },
  ]
  const target = (id: string, prompt: Prompt, form: string, option?: string) => {
    const place = places.find((item) => item.id === id)
    if (!place) throw new tools.PromptError("kimi.error.unknownPlace", { place: id })
    if (option !== undefined || !forms.some((item) => item.id === form)) throw new tools.PromptError("kimi.error.unknownForm", { form })
    const slug = tools.slugOf(prompt.name)
    return { slug, ref: { scope: place.scope, file: form === "agent" ? `${KIMI_AGENT_DIR}/${slug}.md` : KIMI_INSTRUCTION_FILE } }
  }
  const owned = (text: string, slug: string) => {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
    if (lines[0]?.trim() !== "---") return false
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
    return end >= 0 && lines.slice(end + 1).find((line) => line.trim() !== "") === `<!-- context-hub:${slug} -->`
  }
  const marker = (slug: string) => `<!-- context-hub:${slug} -->`
  return {
    id: KIMI_CODE_ID,
    places,
    async held(io, place, prompt) {
      const agent = target(place, prompt, "agent")
      const instructions = target(place, prompt, "instructions")
      const [agentText, text] = await Promise.all([io.files.read(agent.ref), io.files.read(instructions.ref)])
      return { agent: agentText !== null, instructions: text !== null && tools.withoutSection(text, instructions.slug) !== null }
    },
    async install(io, place, prompt, form, option) {
      const { slug, ref } = target(place, prompt, form, option)
      if (form === "agent" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new tools.PromptError("kimi.error.agentName", { name: prompt.name })
      }
      const existing = await io.files.read(ref)
      if (form === "instructions") {
        if (existing !== null && broken(existing, slug)) throw new tools.PromptError("kimi.error.sectionBroken", { file: ref.file })
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }))
      } else {
        if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("kimi.error.handwritten", { file: ref.file })
        const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || slug
        await io.files.write(ref, tools.commandFile({ name: slug, description, body: `${marker(slug)}\n${prompt.prompt}`, frontmatter: true }))
      }
    },
    async remove(io, place, prompt, form, option) {
      const { slug, ref } = target(place, prompt, form, option)
      const existing = await io.files.read(ref)
      if (existing === null) return false
      if (form === "instructions") {
        if (broken(existing, slug)) throw new tools.PromptError("kimi.error.sectionBroken", { file: ref.file })
        const next = tools.withoutSection(existing, slug)
        if (next === null) return false
        if (next.trim() === "") await io.files.remove(ref)
        else await io.files.write(ref, next)
      } else {
        if (!owned(existing, slug)) throw new tools.PromptError("kimi.error.handwritten", { file: ref.file })
        await io.files.remove(ref)
      }
      return true
    },
  }
}
