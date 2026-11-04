import type { ExtensionIcon, PromptIo, PromptProvider, PromptTools } from "./contracts.ts"
import { DEEPSEEK_HARNESS_ID, DEEPSEEK_INSTRUCTIONS } from "./locations.ts"

const PLACE = "deepseek-harness-global"
const REF = { scope: "global", file: DEEPSEEK_INSTRUCTIONS } as const

function brokenSection(text: string, slug: string): boolean {
  const open = `<!-- context-hub:${slug} -->`
  const close = `<!-- /context-hub:${slug} -->`
  const start = text.indexOf(open)
  const end = text.indexOf(close)
  if (start < 0 && end < 0) return false
  return start < 0 || end < start || text.indexOf(open, start + open.length) >= 0 ||
    text.indexOf(close, end + close.length) >= 0 ||
    /<!-- \/?context-hub:[^>]+ -->/.test(text.slice(start + open.length, end))
}

export function createDeepSeekHarnessPrompts(icon: ExtensionIcon, tools: PromptTools): PromptProvider {
  function assertPlace(place: string): void {
    if (place !== PLACE) throw new tools.PromptError("deepseekHarness.error.unknownPlace", { place })
  }

  function assertForm(form: string, option?: string): void {
    if (form !== "instructions" || option !== undefined) {
      throw new tools.PromptError("deepseekHarness.error.unknownForm", { form: option === undefined ? form : `${form}:${option}` })
    }
  }

  async function read(io: PromptIo, slug: string): Promise<string | null> {
    let text: string | null
    try {
      text = await io.files.read(REF)
    } catch (failure) {
      throw new tools.PromptError("deepseekHarness.error.refused", { file: REF.file }, String(failure))
    }
    if (text !== null && brokenSection(text, slug)) {
      throw new tools.PromptError("deepseekHarness.error.sectionBroken", { file: REF.file, slug })
    }
    return text
  }

  async function change(io: PromptIo, text: string | null): Promise<void> {
    try {
      if (text === null) await io.files.remove(REF)
      else await io.files.write(REF, text)
    } catch (failure) {
      throw new tools.PromptError("deepseekHarness.error.refused", { file: REF.file }, String(failure))
    }
  }

  return {
    id: DEEPSEEK_HARNESS_ID,
    places: [{
      id: PLACE, agent: DEEPSEEK_HARNESS_ID, labelKey: "deepseekHarness.tab", icon,
      scope: "global", order: 20, where: "~/.dsh", generatedOnly: true,
      forms: [{ id: "instructions", labelKey: "deepseekHarness.menu.instructions", removeLabelKey: "deepseekHarness.menu.instructions.remove" }],
    }],
    async held(io, place, prompt): Promise<Record<string, boolean>> {
      assertPlace(place)
      const slug = tools.slugOf(prompt.name)
      const text = await read(io, slug)
      return text !== null && tools.withoutSection(text, slug) !== null ? { instructions: true } : {}
    },
    async install(io, place, prompt, form, option) {
      assertPlace(place)
      assertForm(form, option)
      const slug = tools.slugOf(prompt.name)
      const content = `${prompt.name}\n${prompt.prompt}`
      if (/<!-- \/?context-hub:[^>]+ -->/.test(content)) {
        throw new tools.PromptError("deepseekHarness.error.sectionBroken", { file: REF.file, slug })
      }
      const text = await read(io, slug)
      await change(io, tools.withSection(text, { slug, title: prompt.name, body: prompt.prompt }))
    },
    async remove(io, place, prompt, form, option) {
      assertPlace(place)
      assertForm(form, option)
      const slug = tools.slugOf(prompt.name)
      const text = await read(io, slug)
      if (text === null) return false
      const next = tools.withoutSection(text, slug)
      if (next === null) return false
      await change(io, next.trim() === "" ? null : next)
      return true
    },
  }
}
