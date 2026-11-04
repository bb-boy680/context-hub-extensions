import type {
  ExtensionIcon,
  Prompt,
  PromptForm,
  PromptHeld,
  PromptIo,
  PromptPlace,
  PromptProvider,
  PromptRef,
  PromptTools,
} from "./contracts.ts"
import { COMMAND_DIR, INSTRUCTION_FILE, WORKBUDDY_ID } from "./locations.ts"

/** The forms a place offers; only the machine-wide one adds instructions. */
function formsOf(instructions: boolean): PromptForm[] {
  const forms: PromptForm[] = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove",
    },
  ]
  if (instructions) {
    forms.push({
      id: "instructions",
      labelKey: "workbuddy.menu.instructions",
      removeLabelKey: "workbuddy.menu.instructions.remove",
    })
  }
  return forms
}

/** The marker that claims one generated file as this hub's. */
function markerOf(slug: string): string {
  return `<!-- context-hub:${slug} -->`
}

/** The opening and closing markers of one instruction section. */
function markersOf(slug: string): { open: string; close: string } {
  return { open: markerOf(slug), close: `<!-- /context-hub:${slug} -->` }
}

/**
 * Whether the file carries this prompt's marker as its first body line.
 *
 * A file with no frontmatter, no closing fence, or text before the marker is
 * not this hub's — the marker is a record of what was written here, not a word
 * that may appear anywhere in someone else's prose.
 */
function ownedBy(text: string, slug: string): boolean {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return false
  const end = lines.findIndex((line, at) => at > 0 && line.trim() === "---")
  if (end < 0) return false
  const first = lines.slice(end + 1).find((line) => line.trim() !== "")
  return first === markerOf(slug)
}

/**
 * Whether an instruction file's markers for one slug are incomplete.
 *
 * `withSection`/`withoutSection` treat an unclosed block as running to the end
 * of the file. Refusing here keeps a broken marker from swallowing the person's
 * own text after it.
 */
function brokenSection(text: string, slug: string): boolean {
  const { open, close } = markersOf(slug)
  const opened = text.indexOf(open)
  const closed = text.indexOf(close)
  if (opened < 0 && closed < 0) return false
  return opened < 0 || closed < 0 || closed < opened ||
    text.indexOf(open, opened + open.length) >= 0 ||
    text.indexOf(close, closed + close.length) >= 0
}

function fileOf(tools: PromptTools, prompt: Prompt, slug: string): string {
  const generated = tools.commandFile({
    name: prompt.name,
    description: prompt.description,
    body: prompt.prompt,
    frontmatter: true,
  })
  const lines = generated.split("\n")
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (lines[0]?.trim() !== "---" || end < 0) throw new Error("generated command has no frontmatter")
  lines.splice(end + 1, 0, "", markerOf(slug))
  return lines.join("\n")
}

/** The file one action writes. */
function targetOf(
  tools: PromptTools,
  place: PromptPlace,
  prompt: Prompt,
  form: string,
  option?: string
): PromptRef {
  const declared = place.forms.find((one) => one.id === form)
  const offered =
    declared !== undefined &&
    (declared.options === undefined || declared.options.length === 0
      ? option === undefined
      : option !== undefined && declared.options.some((one) => one.id === option))
  if (!offered) {
    throw new tools.PromptError("workbuddy.error.unknownForm", {
      form: option === undefined ? form : `${form}:${option}`,
    })
  }

  const slug = `${tools.slugOf(prompt.name)}.md`
  if (form === "commands") {
    return { scope: place.scope, file: `${COMMAND_DIR}/${slug}` }
  }
  if (form === "instructions") {
    return { scope: place.scope, file: INSTRUCTION_FILE }
  }
  throw new tools.PromptError("workbuddy.error.unknownForm", {
    form: option === undefined ? form : `${form}:${option}`,
  })
}

/** A failed read or write, named the way the page can translate. */
function refused(tools: PromptTools, ref: PromptRef, failure: unknown): Error {
  const message = failure instanceof Error ? failure.message : String(failure)
  return new tools.PromptError("workbuddy.error.refused", { file: ref.file }, message)
}

/** Create the provider this extension registers. */
export function createWorkBuddyPrompts(
  icon: ExtensionIcon,
  tools: PromptTools
): PromptProvider {
  const places: PromptPlace[] = [
    {
      id: "workbuddy-coding-global",
      agent: WORKBUDDY_ID,
      labelKey: "workbuddy.coding",
      icon,
      scope: "global",
      order: 20,
      where: "~/.codebuddy",
      forms: formsOf(true),
    },
    {
      id: "workbuddy-coding",
      agent: WORKBUDDY_ID,
      labelKey: "workbuddy.coding",
      icon,
      scope: "workspace",
      order: 20,
      where: ".codebuddy",
      forms: formsOf(false),
    },
  ]

  const placeOf = (id: string): PromptPlace => {
    const found = places.find((one) => one.id === id)
    if (found === undefined) {
      throw new tools.PromptError("workbuddy.error.unknownPlace", { place: id })
    }
    return found
  }

  const read = async (io: PromptIo, ref: PromptRef): Promise<string | null> => {
    try {
      return await io.files.read(ref)
    } catch (failure) {
      throw refused(tools, ref, failure)
    }
  }

  const write = async (io: PromptIo, ref: PromptRef, text: string): Promise<void> => {
    try {
      await io.files.write(ref, text)
    } catch (failure) {
      throw refused(tools, ref, failure)
    }
  }

  const removeFile = async (io: PromptIo, ref: PromptRef): Promise<void> => {
    try {
      await io.files.remove(ref)
    } catch (failure) {
      throw refused(tools, ref, failure)
    }
  }

  return {
    id: WORKBUDDY_ID,
    places,

    async held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld> {
      const one = placeOf(place)
      const slug = tools.slugOf(prompt.name)
      const answer: Record<string, boolean> = {}
      for (const form of one.forms) {
        if (form.id === "instructions") {
          const text = await read(io, targetOf(tools, one, prompt, form.id))
          if (text !== null && tools.withoutSection(text, slug) !== null) {
            answer.instructions = true
          }
          continue
        }
        const text = await read(io, targetOf(tools, one, prompt, form.id))
        if (text !== null && ownedBy(text, slug)) answer[form.id] = true
      }
      return answer
    },

    async install(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<void> {
      const one = placeOf(place)
      const ref = targetOf(tools, one, prompt, form, option)
      const slug = tools.slugOf(prompt.name)

      if (form === "instructions") {
        const existing = await read(io, ref)
        if (existing !== null && brokenSection(existing, slug)) {
          throw new tools.PromptError("workbuddy.error.sectionBroken", {
            file: ref.file,
            slug,
          })
        }
        await write(
          io,
          ref,
          tools.withSection(existing, {
            slug,
            title: prompt.name,
            body: prompt.prompt,
          })
        )
        return
      }

      const existing = await read(io, ref)
      /* A file without this prompt's marker belongs to a person. Overwriting it
         would lose what they wrote, so the conflict is named instead. */
      if (existing !== null && !ownedBy(existing, slug)) {
        throw new tools.PromptError("workbuddy.error.handwritten", { file: ref.file })
      }
      await write(io, ref, fileOf(tools, prompt, slug))
    },

    async remove(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<boolean> {
      const one = placeOf(place)
      const ref = targetOf(tools, one, prompt, form, option)
      const slug = tools.slugOf(prompt.name)

      if (form === "instructions") {
        const existing = await read(io, ref)
        if (existing === null) return false
        if (brokenSection(existing, slug)) {
          throw new tools.PromptError("workbuddy.error.sectionBroken", {
            file: ref.file,
            slug,
          })
        }
        const next = tools.withoutSection(existing, slug)
        if (next === null) return false
        /* A file whose whole content was this section is one the hub made. */
        if (next.trim() === "") await removeFile(io, ref)
        else await write(io, ref, next)
        return true
      }

      const existing = await read(io, ref)
      if (existing === null || !ownedBy(existing, slug)) return false
      await removeFile(io, ref)
      return true
    },
  }
}
