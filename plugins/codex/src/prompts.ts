/**
 * Where Codex takes a prompt, and how this extension writes it there.
 *
 * Codex has two prompt surfaces this extension owns: the machine-wide
 * `~/.codex/AGENTS.md`, which takes a marked section, and agent roles under
 * `.codex/agents/`, one TOML file per role. The project's own `AGENTS.md` is
 * already the hub's shared workspace place, so it is not registered again
 * here — the same file would otherwise appear twice in one menu.
 *
 * A non-empty `~/.codex/AGENTS.override.md` wins over `AGENTS.md` outright, so
 * the provider refuses to write an instruction section that Codex would ignore.
 */
import type {
  ExtensionIcon,
  McpTools,
  Prompt,
  PromptForm,
  PromptHeld,
  PromptIo,
  PromptPlace,
  PromptProvider,
  PromptRef,
  PromptTools,
} from "./contracts.ts"
import {
  CODEX_AGENT_DIR,
  CODEX_GLOBAL_INSTRUCTION_FILE,
  CODEX_GLOBAL_OVERRIDE_FILE,
  CODEX_ID,
} from "./locations.ts"

/** The forms a global place offers; the workspace place has only the agent. */
function formsOf(instructions: boolean): PromptForm[] {
  const agent: PromptForm = {
    id: "agent",
    labelKey: "prompts.menu.agent",
    removeLabelKey: "prompts.menu.agent.remove",
  }
  return instructions
    ? [
        {
          id: "instructions",
          labelKey: "codex.menu.instructions",
          removeLabelKey: "codex.menu.instructions.remove",
        },
        agent,
      ]
    : [agent]
}

/** A body written as one normalized block, the way a generated file is. */
function normalizeBody(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "")
}

/** The first line that marks a role file as this hub's. */
function markerOf(slug: string): string {
  return `# context-hub:${slug}`
}

/**
 * The file one action writes.
 *
 * @throws a `PromptError` naming the form when the place does not offer it —
 * the menu cannot produce that call, so reaching it means a caller made one up.
 */
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
    throw new tools.PromptError("codex.error.unknownForm", {
      form: option === undefined ? form : `${form}:${option}`,
    })
  }
  if (form === "instructions") {
    return { scope: place.scope, file: CODEX_GLOBAL_INSTRUCTION_FILE }
  }
  if (form === "agent") {
    return {
      scope: place.scope,
      file: `${CODEX_AGENT_DIR}/${tools.slugOf(prompt.name)}.toml`,
    }
  }
  throw new tools.PromptError("codex.error.unknownForm", {
    form: option === undefined ? form : `${form}:${option}`,
  })
}

/** A failed read or write, named the way the page can translate. */
function refused(tools: PromptTools, ref: PromptRef, failure: unknown): Error {
  const message = failure instanceof Error ? failure.message : String(failure)
  return new tools.PromptError("codex.error.refused", { file: ref.file }, message)
}

/** Create the provider this extension registers. */
export function createCodexPrompts(
  promptTools: PromptTools,
  mcp: McpTools,
  icon: ExtensionIcon
): PromptProvider {
  const places: PromptPlace[] = [
    {
      id: "codex-global",
      agent: CODEX_ID,
      labelKey: "codex.tab",
      icon,
      scope: "global",
      order: 20,
      where: "~/.codex",
      forms: formsOf(true),
    },
    {
      id: "codex",
      agent: CODEX_ID,
      labelKey: "codex.tab",
      icon,
      scope: "workspace",
      order: 20,
      where: ".codex",
      forms: formsOf(false),
    },
  ]

  const placeOf = (id: string): PromptPlace => {
    const found = places.find((one) => one.id === id)
    if (found === undefined) {
      throw new promptTools.PromptError("codex.error.unknownPlace", { place: id })
    }
    return found
  }

  const read = async (io: PromptIo, ref: PromptRef): Promise<string | null> => {
    try {
      return await io.files.read(ref)
    } catch (failure) {
      throw refused(promptTools, ref, failure)
    }
  }

  const write = async (io: PromptIo, ref: PromptRef, text: string): Promise<void> => {
    try {
      await io.files.write(ref, text)
    } catch (failure) {
      throw refused(promptTools, ref, failure)
    }
  }

  const removeFile = async (io: PromptIo, ref: PromptRef): Promise<void> => {
    try {
      await io.files.remove(ref)
    } catch (failure) {
      throw refused(promptTools, ref, failure)
    }
  }

  /** Whether a prompt's section is in `AGENTS.md`, when Codex would read it. */
  const instructionsHeld = async (
    io: PromptIo,
    place: PromptPlace,
    prompt: Prompt
  ): Promise<boolean> => {
    const override = await read(io, {
      scope: place.scope,
      file: CODEX_GLOBAL_OVERRIDE_FILE,
    })
    if (override !== null && override.trim() !== "") return false
    const text = await read(io, { scope: place.scope, file: CODEX_GLOBAL_INSTRUCTION_FILE })
    if (text === null) return false
    return promptTools.withoutSection(text, promptTools.slugOf(prompt.name)) !== null
  }

  /** Whether this hub wrote the role file the prompt names. */
  const agentHeld = async (
    io: PromptIo,
    place: PromptPlace,
    prompt: Prompt
  ): Promise<boolean> => {
    const ref = targetOf(promptTools, place, prompt, "agent")
    const text = await read(io, ref)
    return text !== null && text.includes(markerOf(promptTools.slugOf(prompt.name)))
  }

  return {
    id: CODEX_ID,
    places,

    async held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld> {
      const one = placeOf(place)
      const answer: Record<string, boolean> = {}
      for (const form of one.forms) {
        if (form.id === "instructions") {
          if (await instructionsHeld(io, one, prompt)) answer.instructions = true
        } else if (form.id === "agent") {
          if (await agentHeld(io, one, prompt)) answer.agent = true
        }
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
      const ref = targetOf(promptTools, one, prompt, form, option)
      if (form === "instructions") {
        const override = await read(io, {
          scope: one.scope,
          file: CODEX_GLOBAL_OVERRIDE_FILE,
        })
        if (override !== null && override.trim() !== "") {
          throw new promptTools.PromptError("codex.error.override", {
            file: CODEX_GLOBAL_OVERRIDE_FILE,
          })
        }
        const existing = await read(io, ref)
        await write(
          io,
          ref,
          promptTools.withSection(existing, {
            slug: promptTools.slugOf(prompt.name),
            title: prompt.name,
            body: prompt.prompt,
          })
        )
        return
      }

      const slug = promptTools.slugOf(prompt.name)
      const existing = await read(io, ref)
      /* A file without the marker belongs to a person. Overwriting it would
         lose what they wrote, so this names the conflict instead. */
      if (existing !== null && !existing.includes(markerOf(slug))) {
        throw new promptTools.PromptError("codex.error.agentExists", { file: ref.file })
      }
      /* Codex's discovered role needs a description; the prompt's own sentence
         is preferred, then its opening line, then its name. */
      const description =
        prompt.description.trim() || promptTools.describeBody(prompt.prompt) || prompt.name
      const text = [
        markerOf(slug),
        `name = ${mcp.writeTomlString(prompt.name)}`,
        `description = ${mcp.writeTomlString(description)}`,
        `developer_instructions = ${mcp.writeTomlString(normalizeBody(prompt.prompt))}`,
        "",
      ].join("\n")
      await write(io, ref, text)
    },

    async remove(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<boolean> {
      const one = placeOf(place)
      const ref = targetOf(promptTools, one, prompt, form, option)
      if (form === "instructions") {
        /* Removing does not consult the override: if a section is in AGENTS.md,
           cleaning it up is still allowed even while Codex ignores the file. */
        const existing = await read(io, ref)
        if (existing === null) return false
        const next = promptTools.withoutSection(existing, promptTools.slugOf(prompt.name))
        if (next === null) return false
        if (next.trim() === "") await removeFile(io, ref)
        else await write(io, ref, next)
        return true
      }

      const existing = await read(io, ref)
      if (existing === null) return false
      if (!existing.includes(markerOf(promptTools.slugOf(prompt.name)))) return false
      await removeFile(io, ref)
      return true
    },
  }
}
