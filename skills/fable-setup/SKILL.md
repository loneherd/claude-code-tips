---
name: fable-setup
description: Create a subfolder workspace where Fable 5.2 is the main model, unnamed subagents default to Opus, and saved subagents are tiered (fetcher on Haiku, fixer on Sonnet, builder on Opus), with a CLAUDE.md that makes Fable the lead (plans, decides, reviews) and fans bulk work out to parallel subagents. Optional git worktree of a repo inside it. Use when the user says "fable setup", "make a fable folder", "set up a fable session/workspace", or "/fable-setup". Builds the folder only; the user starts the session there.
---

# Fable workspace setup

Builds a folder that the user opens a NEW `claude` session in. A running session cannot switch its own subagent
defaults, so the folder carries them: `.claude/settings.json` makes Fable 5.2 the main model and Opus the default
subagent model, `.claude/agents/` holds three tiered subagents, and `CLAUDE.md` holds the working rules.

Templates sit next to this file in `templates/`.

## Args

`/fable-setup <name> [repo]`
- `<name>`: folder name, created under the current workspace folder. A full path is also accepted.
- `[repo]`: optional path to a git repo. When given, a worktree goes in `<folder>/repo/`.

If no name is given, ask for one. Ask nothing else.

## Steps

1. If the folder exists and already has `.claude/settings.json`, stop and say so. If it exists without one, add the
   files and leave everything else alone.
2. Copy `templates/settings.json` to `<folder>/.claude/settings.json` as is, and copy `templates/agents/*.md`
   (fetcher = Haiku, fixer = Sonnet, builder = Opus) to `<folder>/.claude/agents/`.
3. Copy `templates/CLAUDE.md` to `<folder>/CLAUDE.md`, replacing `{{NAME}}`, `{{DATE}}` (today) and `{{REPO_LINE}}`:
   - no repo: `No repo is attached. Work happens in this folder.`
   - repo: `The code is in repo/, a git worktree of <repo> on branch <branch>, cut from origin/<default> <sha>. Read the repo's own CLAUDE.md first.`
4. Repo only, all as `git -C "<full repo path>"`:
   - `fetch origin --quiet`, then `symbolic-ref --short refs/remotes/origin/HEAD` to find the default branch
   - `worktree add "<folder>/repo" -b fable/<name> origin/<default>`
   - Never touch the repo's main checkout, even when it has modified files.
5. Reply with the folder path, the branch and sha if there is a repo, and the start steps:
   1. Open a new terminal in `<folder>` and run `claude`.
   2. Check that the status line shows Fable 5.2 (or `/model` to confirm).
   3. Repo only, and only if the repo has no CLAUDE.md of its own: run `/init` first so it writes one.
   4. Shift+Tab into plan mode, then give it the job.
   5. `/tasks` shows which model each subagent is on. `/compact` when heavy, `/clear` between jobs.

## Notes

- To change a default for every future folder (effort level, subagent model), edit `templates/settings.json`. To
  change it for one folder, edit that folder's `.claude/settings.json`.
- Memory is keyed to the folder, so a new folder starts with none. The template points the session at your main
  memory folder; fill in its path once in `templates/CLAUDE.md`.
- When the work is merged, remove the worktree: `git -C "<repo>" worktree remove "<folder>/repo"`.
