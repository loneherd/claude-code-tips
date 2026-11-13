# {{NAME}} - Fable workspace (created {{DATE}})

Main model: Fable 5.2. Subagents default to Opus (set in `.claude/settings.json`). Fable is the main model in this
folder by choice, so any parent CLAUDE.md rule that limits Fable to planning does not apply here.

{{REPO_LINE}}

## How to work here

**Fable plans. Opus builds. Sonnet fixes. Haiku fetches.**

- **Fable (main) is the lead.** It plans, makes every judgment call, reviews every diff, commits, and writes the
  summaries. Edits that need judgment stay on the main model, never on a cheap one.
- **Use the subagents in `.claude/agents/`.** Each one sets its own `model:`:
  - `fetcher` (Haiku): reading logs, finding files, "where is X used". Read only.
  - `fixer` (Sonnet): scoped fixes that are already decided, and writing tests.
  - `builder` (Opus): planned multi-file work and deeper discovery or review of an area.
  - Any other subagent defaults to Opus (`CLAUDE_CODE_SUBAGENT_MODEL`), never Fable.
- When a task splits into independent parts, run up to 8 agents at once in one message, in the background. Say which
  agent and model each one is before spawning.
- **Brief each agent so it can work without your context:** the goal, the exact files or area, what is already ruled
  out, the limits below, and the output file path. Agents write details to a file under `findings/` and return a
  summary of at most 15 lines.
- **Agents that edit at the same time get separate file scopes.** They never build or run tests in a shared tree. The
  lead builds and tests after they finish, then reviews each diff before committing.
- **Check agent claims before acting on them.** Spot-check the evidence for anything high-severity or surprising.
- Plan mode before touching any file on a big job.
- Effort starts at medium. Go to high only when it is struggling, then drop back.
- `/compact` when the context gets heavy, `/clear` between jobs.

## Read first

Memory is keyed to the folder, so this folder starts with none. Your main memory is in
`<path to your main project's memory folder>`. Read its `MEMORY.md`, then open the topic files that match the task.

## Standing rules

- Facts only. Never invent a name, role, or cause. Label anything inferred. Identifiers stay verbatim.
- Never print secrets. Redact with `[REDACTED]`.
- Git: `git -C` with full paths. Stage explicit paths, never `git add -A` or `git add .`. Never `checkout`, `stash`,
  or `reset --hard` to tidy up another session's work.
- Changes to live systems (prod, databases, servers) stay with the lead, in plain view, and only when asked for in
  this session.
