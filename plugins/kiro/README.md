# Kiro

Delivers Context Hub assets to Kiro's default locations. Development targets the local Context Hub 0.2.0 source tree; confirm the first published version containing these APIs before release.

| Asset | Workspace | Global |
| --- | --- | --- |
| Skills | `.kiro/skills/<name>/SKILL.md` | `~/.kiro/skills/<name>/SKILL.md` |
| MCP | `.kiro/settings/mcp.json` | `~/.kiro/settings/mcp.json` |
| Steering rules | `.kiro/steering/context-hub-<name>.md` | `~/.kiro/steering/context-hub-<name>.md` |
| Agents | `.kiro/agents/context-hub-<name>.md` | `~/.kiro/agents/context-hub-<name>.md` |
| Instructions | Shared workspace `AGENTS.md` | Managed sections in `~/.kiro/steering/AGENTS.md` |

The MCP provider manages only top-level server declarations, preserving unrelated settings and existing Powers data. The switch reflects the `disabled` field in the selected file; it does not establish connection or effective Kiro state. stdio and HTTP declarations are supported; SSE delivery is rejected because its native encoding is not established. Prompt files are only replaced or removed when they carry this extension's ownership marker.

The extension manages only the default `~/.kiro` root. Custom `KIRO_HOME`, client version detection, hooks, workflows, and cloud synchronization are not implemented. Current Kiro documentation and CLI V3 are the protocol baseline; older clients may not consume these files. A successful action means files were written, not that Kiro loaded the assets, approved permissions, connected a server, or synchronized anything. Scope and agent precedence are resolved by Kiro.

## Powers

Kiro supports Powers in the current Agent Plugins format (`plugin.json`, with optional `skills/` and `mcp.json`). The extension installs these packages at the user scope using Kiro's `powers/installed/<name>` directory, `installed.json`, and `registries/user-added.json`. It stores the package snapshot in a separate ownership record, and refuses to overwrite or delete unmanaged or modified files. Removal retains the payload when other registries may reference it, and reports that retention; a missing or changed source also prevents removal. Installation uses the default `~/.kiro/powers` root; custom `KIRO_POWERS_HOME` is not covered. Persistent enablement is unknown, so no switch is shown.

Kiro also supports the legacy `POWER.md` format; this extension does not implement compatibility for it. Power-managed MCP servers are managed by Kiro and are not added by this extension to standalone MCP configuration. Agent Plugins `mcp.json` is shown in Hub plugin details and market previews when the host includes the corresponding content reader. File transactions are covered by isolated tests; actual Kiro loading has not been verified.

## Sources

- [Skills](https://kiro.dev/docs/skills/), [MCP configuration](https://kiro.dev/docs/mcp/configuration/), [Steering](https://kiro.dev/docs/steering/), [custom agents](https://kiro.dev/docs/custom-agents/creating/), [configuration roots](https://kiro.dev/docs/configuration/)
- [Powers installation](https://kiro.dev/docs/powers/installation/) and [creation](https://kiro.dev/docs/powers/create/)
- The unmodified Kiro icon comes from [kiro.dev/icon.svg](https://kiro.dev/icon.svg?fe599162bb293ea0), downloaded 2026-11-03, SHA-256 `774cbc1c7ecec8c935a6091595583d7a92fc8289d6f1db3f071c0f50c61c369f`. No separate redistribution license was found; the mark belongs to its rights holder and does not imply endorsement. Confirm trademark and asset permissions before public redistribution; see [AWS site terms](https://aws.amazon.com/terms/) and [legal information](https://aws.amazon.com/legal/).
