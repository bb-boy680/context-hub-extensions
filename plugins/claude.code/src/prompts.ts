/**
 * Where Claude Code takes a prompt, and how this extension writes it there.
 *
 * A prompt becomes one Markdown file per name — a slash command, a rule, or an
 * agent definition — or a marked section of the machine-wide `CLAUDE.md`. The
 * project's `CLAUDE.md` is deliberately not offered: it is a shared file, and an
 * action that edits it under the same words as a private one would hide the
 * difference.
 *
 * Nothing here imports a hub package. The naming and section rules arrive in
 * `tools` from the service, so a command written here is byte-identical to one
 * the hub's own workspace place writes.
 */
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
import {
  CLAUDE_CODE_AGENT_DIR,
  CLAUDE_CODE_COMMAND_DIR,
  CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE,
  CLAUDE_CODE_ID,
  CLAUDE_CODE_RULE_DIR,
} from "./locations.ts"

/** The one instruction file this extension adds to. */
const INSTRUCTIONS = "claude"

/** The forms both scopes offer; the machine-wide one adds its memory file. */
function formsOf(memory: boolean): PromptForm[] {
  const forms: PromptForm[] = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove",
    },
    {
      id: "rule",
      labelKey: "prompts.menu.rule",
      removeLabelKey: "prompts.menu.rule.remove",
    },
    {
      id: "agent",
      labelKey: "prompts.menu.agent",
      removeLabelKey: "prompts.menu.agent.remove",
    },
  ]
  if (memory) {
    forms.push({
      id: "instructions",
      labelKey: "claudeCode.menu.documents",
      options: [
        {
          id: INSTRUCTIONS,
          labelKey: "claudeCode.menu.instructions",
          removeLabelKey: "claudeCode.menu.instructions.remove",
        },
      ],
    })
  }
  return forms
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
    throw new tools.PromptError("claudeCode.error.unknownForm", {
      form: option === undefined ? form : `${form}:${option}`,
    })
  }
  const slug = `${tools.slugOf(prompt.name)}.md`
  if (form === "commands") return { scope: place.scope, file: `${CLAUDE_CODE_COMMAND_DIR}/${slug}` }
  if (form === "rule") return { scope: place.scope, file: `${CLAUDE_CODE_RULE_DIR}/${slug}` }
  if (form === "agent") return { scope: place.scope, file: `${CLAUDE_CODE_AGENT_DIR}/${slug}` }
  if (form === "instructions") {
    return { scope: place.scope, file: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE }
  }
  throw new tools.PromptError("claudeCode.error.unknownForm", {
    form: option === undefined ? form : `${form}:${option}`,
  })
}

/** A failed read or write, named the way the page can translate. */
function refused(tools: PromptTools, failure: unknown): Error {
  const message = failure instanceof Error ? failure.message : String(failure)
  return new tools.PromptError("claudeCode.error.refused", undefined, message)
}

/** Create the provider this extension registers. */
export function createClaudeCodePrompts(
  icon: ExtensionIcon,
  tools: PromptTools
): PromptProvider {
  const places: PromptPlace[] = [
    {
      id: "claude-code",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      order: 20,
      where: ".claude",
      forms: formsOf(false),
    },
    {
      id: "claude-code-global",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      order: 20,
      where: "~/.claude",
      forms: formsOf(true),
    },
  ]

  const placeOf = (id: string): PromptPlace => {
    const found = places.find((one) => one.id === id)
    if (found === undefined) {
      throw new tools.PromptError("claudeCode.error.unknownPlace", { place: id })
    }
    return found
  }

  const read = async (io: PromptIo, ref: PromptRef): Promise<string | null> => {
    try {
      return await io.files.read(ref)
    } catch (failure) {
      throw refused(tools, failure)
    }
  }

  return {
    id: CLAUDE_CODE_ID,
    places,

    async held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld> {
      const one = placeOf(place)
      const slug = tools.slugOf(prompt.name)
      const answer: Record<string, boolean> = {}
      for (const form of one.forms) {
        if (form.id === "instructions") {
          const text = await read(io, targetOf(tools, one, prompt, form.id, INSTRUCTIONS))
          if (text === null) continue
          const there = tools.withoutSection(text, slug) !== null
          for (const option of form.options ?? []) {
            if (there) answer[`${form.id}:${option.id}`] = true
          }
          continue
        }
        if ((await read(io, targetOf(tools, one, prompt, form.id))) !== null) {
          answer[form.id] = true
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
      const ref = targetOf(tools, one, prompt, form, option)
      try {
        if (form === "instructions") {
          const existing = await io.files.read(ref)
          await io.files.write(
            ref,
            tools.withSection(existing, {
              slug: tools.slugOf(prompt.name),
              title: prompt.name,
              body: prompt.prompt,
            })
          )
          return
        }
        await io.files.write(
          ref,
          tools.commandFile({
            name: prompt.name,
            description: prompt.description,
            body: prompt.prompt,
            /* A command and an agents file carry the frontmatter; a rule is the
               prompt as it was written. */
            frontmatter: form !== "rule",
          })
        )
      } catch (failure) {
        throw refused(tools, failure)
      }
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
      try {
        if (form === "instructions") {
          const existing = await io.files.read(ref)
          if (existing === null) return false
          const next = tools.withoutSection(existing, tools.slugOf(prompt.name))
          if (next === null) return false
          /* A file whose whole content was this section is one the hub made. */
          if (next.trim() === "") await io.files.remove(ref)
          else await io.files.write(ref, next)
          return true
        }
        if ((await io.files.read(ref)) === null) return false
        await io.files.remove(ref)
        return true
      } catch (failure) {
        throw refused(tools, failure)
      }
    },
  }
}
