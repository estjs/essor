# Writing Essor Apps: Agent Adapter Pack

`SKILL.md` is the source of truth. The files in this directory are adapter templates for agents that do not natively load Claude/Gemini-style skills.

## Install Targets

| Agent | Preferred target | Adapter |
|---|---|---|
| Claude Code | `.claude/skills/writing-essor-apps/SKILL.md` | use this skill directory as-is |
| Claude Code project memory | `CLAUDE.md` or nested `CLAUDE.md` | `agents/CLAUDE.md` |
| Gemini CLI skills | `.gemini/skills/writing-essor-apps/SKILL.md` | copy this whole skill directory |
| Gemini CLI context | `GEMINI.md` | `agents/GEMINI.md` |
| Qwen Code / Gemini-compatible forks | `QWEN.md` or `GEMINI.md` | `agents/QWEN.md` |
| OpenAI Codex | `AGENTS.md` or nested `AGENTS.md` | `agents/AGENTS.md` |
| AGENTS.md ecosystem: Aider, Zed, Amp, Devin, Factory, Junie, Goose, opencode, Warp, VS Code agents | `AGENTS.md` | `agents/AGENTS.md` |
| Cursor | `.cursor/rules/writing-essor-apps.mdc` | `agents/cursor.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` or `.github/instructions/essor.instructions.md` | `agents/copilot-instructions.md` |
| Cline | `.clinerules/writing-essor-apps.md` | `agents/cline.md` |
| Windsurf Cascade | workspace rule or `.windsurfrules` fallback | `agents/windsurf.md` |
| Continue | `.continue/rules/writing-essor-apps.md` | `agents/continue.md` |
| Roo Code legacy/forks | `.roo/rules/writing-essor-apps.md` or AGENTS.md | `agents/cline.md` or `agents/AGENTS.md` |
| Amazon Q Developer | `.amazonq/rules/writing-essor-apps.md` or custom agent context | `agents/amazonq.md` |

## Copy Targets

Use these as examples; choose only the targets used by your team.

```bash
cp agents/AGENTS.md AGENTS.md
cp agents/CLAUDE.md CLAUDE.md
mkdir -p .cursor/rules && cp agents/cursor.mdc .cursor/rules/writing-essor-apps.mdc
mkdir -p .github/instructions && cp agents/copilot-instructions.md .github/instructions/essor.instructions.md
cp agents/GEMINI.md GEMINI.md
cp agents/QWEN.md QWEN.md
mkdir -p .clinerules && cp agents/cline.md .clinerules/writing-essor-apps.md
mkdir -p .roo/rules && cp agents/cline.md .roo/rules/writing-essor-apps.md
mkdir -p .continue/rules && cp agents/continue.md .continue/rules/writing-essor-apps.md
mkdir -p .amazonq/rules && cp agents/amazonq.md .amazonq/rules/writing-essor-apps.md
```

## Maintenance Rules

- Keep public API facts in `SKILL.md` and `references/` first.
- Keep adapter files short because many tools inject them into every request.
- Do not add unverified APIs. Check package exports before naming new Essor APIs.
- If a rule differs by agent, document the reason in this README instead of hiding the difference in the adapter.
- Prefer one source of truth plus thin adapters over copy-pasting long reference docs into each agent file.
- On Essor version bumps, first audit package exports, then update `SKILL.md`, `references/`, and only then regenerate/adapt `agents/`.

## Verification Prompt

After installing an adapter, ask the target agent:

```text
Summarize the active Essor instructions. Include how to choose createApp vs hydrate, how $ state works, how component-scoped effect disposal works, and which server render APIs are public.
```

Expected essentials:

- `$` prefix creates local reactive state; no `$` means plain JavaScript.
- SSR/SSG uses `hydrate()`, client-only uses `createApp()`.
- Server rendering uses `renderToString()` or `renderToStringAsync()` from `@estjs/server`; no `renderToStream` in Essor 0.0.16-beta.8.
- Component-scoped `effect()` is automatically disposed by Essor scope; timers/listeners still need lifecycle cleanup.
