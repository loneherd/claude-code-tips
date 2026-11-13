# Claude Code Tips & Tricks

Practical shortcuts, configs, and workflows for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — the CLI for Claude from Anthropic.

These aren't just documentation repackaged. They're patterns we've developed and refined through daily use — things that actually changed how we work.

**Where tips come from:** not all of these started with us. We pick up ideas from other people's repos, posts, docs and talks, try them in our own daily work, and keep what holds up. By the time a tip lands here it has been changed to fit how we work, often a lot. When we know where an idea came from, we say so in the tip and list it under [Resources](#resources). If you spot your idea here without credit, open an issue and we'll add it.

> **Contributions welcome** — open a PR to add your own tips.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- **Setup & Launch**
  - [1. Quick Launch with `cc`](#1-quick-launch-with-cc)
  - [2. Custom Status Line](#2-custom-status-line)
  - [3. Workspace Folder Pattern](#3-workspace-folder-pattern)
- **Configuration**
  - [4. Project Instructions with `CLAUDE.md`](#4-project-instructions-with-claudemd)
  - [5. Security Policy in `CLAUDE.md`](#5-security-policy-in-claudemd)
  - [6. Permission Allowlists](#6-permission-allowlists)
  - [7. Useful Settings](#7-useful-settings)
- **Workflow**
  - [8. Memory System](#8-memory-system)
  - [9. Pipe Anything into Claude](#9-pipe-anything-into-claude)
  - [10. `/wrap`: Checkpoint a Session](#10-wrap-checkpoint-a-session)
  - [11. Tuning for Opus 5.5 (Token Budget)](#11-tuning-for-opus-55-token-budget)
  - [12. Mods: Info That Doesn't Scroll Away](#12-mods-info-that-doesnt-scroll-away)
  - [13. Lazy Senior Dev: Write Less Code](#13-lazy-senior-dev-write-less-code)
  - [14. Voice Guide: Drafts That Sound Like You](#14-voice-guide-drafts-that-sound-like-you)
  - [15. `/delegate`: Route Work to the Cheapest Capable Agent](#15-delegate-route-work-to-the-cheapest-capable-agent)
  - [16. `/voice`: Talk Instead of Type](#16-voice-talk-instead-of-type)
  - [17. Parallel Sessions: Guard the Deploy, Not Just the Code](#17-parallel-sessions-guard-the-deploy-not-just-the-code)
  - [18. Code-Rendered Video Workflow](#18-code-rendered-video-workflow)
  - [19. `/tokenwatch`: Measure Token Burn, Don't Guess](#19-tokenwatch-measure-token-burn-dont-guess)
  - [20. Weekly Maintenance: A Self-Renewing Check-In](#20-weekly-maintenance-a-self-renewing-check-in)
- **Fable**
  - [21. Fable Plans, Opus Builds, Haiku Fetches](#21-fable-plans-opus-builds-haiku-fetches)
  - [22. `/fable-setup`: A Fable Workspace in One Command](#22-fable-setup-a-fable-workspace-in-one-command)
- [Quick Reference](#quick-reference)
- [Resources](#resources)

---

## Prerequisites

| Tool | Install | Verify |
|---|---|---|
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| **Node.js** (v18+) | [nodejs.org](https://nodejs.org) | `node --version` |
| **PowerShell 7+** (Windows tips) | `winget install Microsoft.PowerShell` | `pwsh --version` |
| **GitHub CLI** (optional) | `winget install GitHub.cli` | `gh --version` |

Already have Claude Code running? Skip to [Tips](#1-quick-launch-with-cc).

---

## Setup & Launch

### 1. Quick Launch with `cc`

Launch Claude Code in your project folder from anywhere in your terminal. When the session ends, you're back where you started.

<details>
<summary><strong>PowerShell (Windows)</strong></summary>

1. Open your profile:

   ```powershell
   notepad $PROFILE
   ```

   If the file doesn't exist, say yes when prompted to create it.

2. Add this function — **change the path** to your own project folder:

   ```powershell
   function CC {
     Push-Location "C:\Users\YourName\YourProjectFolder"
     claude @args
     Pop-Location
   }
   ```

3. Reload:

   ```powershell
   . $PROFILE
   ```

</details>

<details>
<summary><strong>Bash / Zsh (macOS, Linux)</strong></summary>

Add to `~/.bashrc`, `~/.zshrc`, or `~/.bash_profile`:

```bash
cc() {
  pushd ~/your-project-folder > /dev/null
  claude "$@"
  popd > /dev/null
}
```

Then reload: `source ~/.bashrc` (or `~/.zshrc`).

</details>

**Usage:**

```
cc                          # Interactive session in your project folder
cc "fix the login bug"      # Start with a prompt
cc --resume                 # Resume last session
cc --continue               # Continue last conversation
```

All `claude` flags work — `cc` just forwards everything.

**Why a dedicated folder?** Claude Code reads `CLAUDE.md` from the working directory for project-specific instructions. A consistent launch folder means your preferences, conventions, and context load every time.

---

### 2. Custom Status Line

Replace the default status line with one that shows your model, directory, and rate-limit usage at a glance — with color-coded meters and reset countdowns.

```
Claude Opus 4.6 | my-project | 5h ████░ 78% ↻2:15p | 7d ██░░░ 42% ↻Mon 8a
```

| Color | Usage |
|---|---|
| Green | Under 50% |
| Yellow | 50–74% |
| Red | 75–89% |
| Bright red | 90%+ |

**Setup (PowerShell / Windows):**

1. Copy [`scripts/statusline.ps1`](scripts/statusline.ps1) to your Claude config folder:

   ```powershell
   Copy-Item scripts\statusline.ps1 "$HOME\.claude\statusline.ps1"
   ```

2. Open your Claude Code settings:

   ```
   claude /config
   ```

   Or edit `~/.claude/settings.json` directly. Add:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "pwsh -NoProfile -File \"C:/Users/YourName/.claude/statusline.ps1\""
     }
   }
   ```

   Replace `YourName` with your Windows username.

3. Restart Claude Code. The new status line appears at the bottom.

> **Bash/Zsh port:** Not yet available — the same logic applies using `jq` for JSON parsing and standard ANSI escapes. PRs welcome!

---

### 3. Workspace Folder Pattern

Instead of scattering projects everywhere, create a single workspace folder that Claude always launches into. This becomes your hub — projects, logs, config, and context all live here.

**Recommended structure:**

```
~/claude-workspace/
├── CLAUDE.md           # Global instructions (loaded every session)
├── .claude/            # Claude-specific config
├── logs/
│   └── journal.md      # Decision log — key choices, not every detail
├── screenshots/        # Visual documentation
├── project-a/          # Your projects as subdirectories
│   └── CLAUDE.md       # Project-specific instructions (layered on top)
├── project-b/
│   └── CLAUDE.md
└── docs/               # Shared references, conventions
```

**Why this works:**
- Your root `CLAUDE.md` applies to everything — security policies, coding style, deployment conventions
- Each project gets its own `CLAUDE.md` that layers on top with project-specific rules
- The journal captures decisions you'd otherwise forget between sessions
- Screenshots land in a known place instead of your desktop

Pair this with the [`cc` shortcut](#1-quick-launch-with-cc) and you're always one command away from a fully-configured session.

---

## Configuration

### 4. Project Instructions with `CLAUDE.md`

Drop a `CLAUDE.md` in any project root. Claude reads it automatically at session start and follows the instructions every time.

```markdown
# Project Instructions

- Use TypeScript strict mode
- Tests live in __tests__/ next to source files
- Run `npm run lint` before committing
- Deploy flow: staging first, then production
- Never commit .env files
```

**The hierarchy:** Claude reads `CLAUDE.md` files at multiple levels and merges them:

1. `~/.claude/CLAUDE.md` — your personal global defaults
2. Your workspace root `CLAUDE.md` — shared team conventions
3. Subdirectory `CLAUDE.md` files — project-specific overrides

Lower levels override higher ones. Use this to set broad rules at the top and get specific as you go deeper.

---

### 5. Security Policy in `CLAUDE.md`

If you work with databases, APIs, servers, or anything with credentials, put a security policy in your `CLAUDE.md`. Claude follows it every session without you having to remind it.

**Example — credential management:**

```markdown
## Security Policy

### Rules
1. NEVER include passwords, API keys, or tokens in commands or output
2. ALWAYS use environment variables — `$env:PGPASSWORD`, not the actual value
3. ALWAYS redact credentials with `***` or `[REDACTED]` in examples
4. NEVER echo, print, or display credential values

### Credential Storage
- Use **Windows Credential Manager** (or your OS keychain) for secrets
- Access via PowerShell cmdlets / `security` CLI without exposing values
- Store with `cmdkey` or your platform's secure storage
```

**Why this matters:** Without this, Claude will sometimes put credentials in plain text in commands it shows you — especially database connection strings, API keys in curl commands, etc. One line in `CLAUDE.md` prevents it permanently.

---

### 6. Permission Allowlists

Tired of approving `git status` and `ls` every time? Add a permission allowlist so safe, read-only commands run without prompting.

Edit `.claude/settings.local.json` in your project (or `~/.claude/settings.json` for global):

```json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(gh *)",
      "Bash(npm:*)",
      "Bash(node:*)",
      "Bash(python:*)",
      "Bash(ls:*)",
      "Bash(find:*)",
      "Bash(grep *)",
      "Bash(curl:*)",
      "Bash(ssh:*)",
      "Bash(scp:*)",
      "PowerShell(Test-Path *)",
      "PowerShell(Get-Content *)",
      "PowerShell(Get-ChildItem *)",
      "WebSearch"
    ]
  }
}
```

**Start conservative.** Add commands as you notice yourself approving the same ones repeatedly. You can always remove entries later.

**Pro tip:** Use `.claude/settings.local.json` (project-level, gitignored) for personal preferences and `.claude/settings.json` (committed) for team-shared permissions.

---

### 7. Useful Settings

Edit with `/config` inside a session or directly in `~/.claude/settings.json`:

```jsonc
{
  // Dark theme
  "theme": "dark",

  // Default to a specific model
  "model": "claude-sonnet-5",

  // Use fullscreen TUI mode
  "tui": "fullscreen",

  // Get push notifications when background tasks finish
  "agentPushNotifEnabled": true
}
```

---

## Workflow

### 8. Memory System

Claude Code has a built-in auto-memory feature that persists information across sessions. Instead of re-explaining who you are and how you work every time, teach it once.

**What to save:**
- Your role and expertise level (so explanations match your depth)
- Feedback on how Claude should work ("don't do X", "always do Y")
- Project context that isn't in the code (who's doing what, deadlines, decisions)
- Pointers to external resources (where bugs are tracked, which dashboards matter)

**What NOT to save:**
- Code patterns or architecture (derive from the code itself)
- Git history (use `git log`)
- Fix recipes (they're in the commits)
- Anything already in `CLAUDE.md`

**How it works:** Memory files live in `~/.claude/projects/<project>/memory/` with a `MEMORY.md` index. Each memory is a small markdown file with frontmatter for type and description.

**Example memories:**

```markdown
# feedback: no trailing summaries
Don't summarize what you just did at the end of every response — I can read the diff.

# feedback: delegate research
Always look for opportunities to offload research and brainstorming to local
models or free-tier APIs to save tokens.

# project: merge freeze
Merge freeze begins 2026-03-05 for mobile release cut. Flag any non-critical
PR work scheduled after that date.
```

**Pro tip:** Tell Claude to remember things as you go — "remember that I prefer single PRs for refactors" — and it saves a memory file automatically. Over time you build up a profile that makes every session start smarter.

---

### 9. Pipe Anything into Claude

Use `-p` (print mode) to send one-shot prompts and pipe in files, diffs, or logs:

```bash
# Explain a file
cat app.py | claude -p "explain this"

# Code review a diff
git diff | claude -p "review for bugs"

# Debug failing tests
npm test 2>&1 | claude -p "why are these failing?"

# Summarize recent logs
tail -100 errors.log | claude -p "what's going wrong?"
```

PowerShell equivalents:

```powershell
Get-Content app.py | claude -p "explain this"
git diff | claude -p "review for bugs"
Get-Content errors.log -Tail 100 | claude -p "what's going wrong?"
```

### 10. `/wrap`: Checkpoint a Session

Long sessions end with reboots, context limits, or "I'll finish tomorrow." `/wrap` is a custom skill that saves everything a fresh session needs to pick up where you left off:

- **Memory:** updates or creates memory files for new decisions and preferences, and keeps the `MEMORY.md` index in sync
- **Resume docs:** updates the `NEXT.md` / `TASKS.md` / `CONTEXT.md` files the project already has, and moves the "start here" marker
- **Journal:** appends a dated entry to `logs/journal.md` if you keep one
- **Git:** commits this session's files in every repo touched, staged by explicit path with a secrets check. **It never pushes.**
- **Loose ends:** stops background servers or watchers and lists anything waiting on you (reboot, login)
- **Report:** a fixed summary ending with the exact phrase to resume with

**Install** (works in every project):

```bash
mkdir -p ~/.claude/skills/wrap
curl -o ~/.claude/skills/wrap/SKILL.md https://raw.githubusercontent.com/loneherd/claude-code-tips/master/skills/wrap/SKILL.md
```

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills\wrap" | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/loneherd/claude-code-tips/master/skills/wrap/SKILL.md -OutFile "$HOME\.claude\skills\wrap\SKILL.md"
```

Then type `/wrap` at the end of a session. The skill sets `disable-model-invocation: true`, so it only runs when you ask for it.

### 11. Tuning for Opus 5.5 (Token Budget)

Opus 5.5 always thinks before answering, and those thinking tokens count against your plan. It also keeps going longer on multi-step tasks. Three short `CLAUDE.md` sections, based on Anthropic's Opus 5.5 prompting guidance, keep it productive without burning through a $20 plan. On a personal Pro account, older Opus 5 hit the limits fast; Opus 5.5 with these rules runs daily without hitting them.

```markdown
## Task Persistence

When a task has multiple steps or will run long, keep a checklist in TASKS.md. Tick each item when it's done, and add anything new you find. Read the file at the start of a session rather than re-deriving state from scrollback.

## Agentic Run Behavior

When a step doesn't need my input, keep going. Put status notes in the same message as your next action.
Stop and ask only when you can't continue without me, or before anything destructive: deleting data, force-pushing, or changing anything outside this repository.

Once you have answered something, treat that answer as done. Don't go back over an earlier answer unless I ask about it or point out a problem with it.

## Token Efficiency

- Default to low/medium effort for routine work (edits, Q&A, simple fixes)
- Use high effort only for architecture, complex debugging, or multi-step planning
```

**Why each one helps:**

- **Task Persistence:** state lives in a small file instead of being rebuilt from a long conversation.
- **Agentic Run Behavior:** fewer stop-and-ask round trips, and no re-thinking questions that are already settled.
- **Token Efficiency:** high effort means more thinking tokens, so save it for work that needs it.

**Habit:** run `/clear` between unrelated tasks. Every turn resends the whole conversation, so a long session costs more per message than a fresh one.

**Try it:** paste this into Claude Code to add the rules to your user-level `CLAUDE.md`:

```text
Add the "Task Persistence", "Agentic Run Behavior", and "Token Efficiency" sections from
section 11 of https://github.com/loneherd/claude-code-tips to my user-level
CLAUDE.md (~/.claude/CLAUDE.md). Create the file if it doesn't exist. Show me the exact
text before you write it, and don't change anything else.
```

To undo, delete the three sections.

### 12. Mods: Info That Doesn't Scroll Away

Mods are small plugins of function hooks that run inside Claude Code and put information in a fixed spot: the status line, or a band above the prompt. Three of ours are public in [claude-code-mods](https://github.com/loneherd/claude-code-mods) (MIT), each written with Claude's help.

| Mod | What it shows | Where | Tokens? |
| --- | --- | --- | --- |
| `subagent-models` | Which model each subagent runs on, e.g. `agents: haiku-4-5 ✓, sonnet-5-5` | Status line | No |
| `session-recap` | 2-5 bullets on what the last prompt did, plus questions Claude is still waiting on | Band above prompt | One small Haiku call per prompt |
| `run-breakdown` | After a long run: model and effort for the main session, each subagent, and Gemini/Ollama calls | Band above prompt | No |

**Why:** a long run buries the question or result you need. Mixed model setups make it easy to lose track of what ran where.

**Requirements:** a Claude Code build with hook modules turned on. Built and tested on 2.1.287 on Windows.

**Try one for a session** (nothing saved):

```powershell
git clone https://github.com/loneherd/claude-code-mods.git
claude --plugin-dir .\claude-code-mods\subagent-models
```

Repeat `--plugin-dir` to load several.

**Load them every session:** add `CLAUDE_CODE_PLUGIN_DIRS` to the `env` block of `~/.claude/settings.json`, folders separated by `;` on Windows or `:` on macOS/Linux, then open a new terminal.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\path\to\claude-code-mods\subagent-models;C:\path\to\claude-code-mods\session-recap;C:\path\to\claude-code-mods\run-breakdown"
  }
}
```

Use your user settings, not a project's; project settings are ignored for this.

**Tips:**
- Try a mod with `--plugin-dir` first and add it to the always-on list only after it behaves.
- `run-breakdown` only appears after runs longer than `MIN_MS` (in `hooks/register.tsx`), and its Gemini/Ollama tool prefixes are specific to our setup, so change them to yours.
- To undo, remove the folder from `CLAUDE_CODE_PLUGIN_DIRS`.

Each mod's README in the repo has the details.

### 13. Lazy Senior Dev: Write Less Code

Agents tend to over-build: extra abstractions, new dependencies for five lines, helpers that already exist two files over. This `CLAUDE.md` section makes them check a short ladder before writing anything. It is adapted from [ponytail](https://github.com/DietrichGebert/ponytail) (MIT) by Dietrich Gebert, a full plugin for the same idea. We took only the prompt rules, with no hooks, and softened its output limit into a 4-line prose cap.

```markdown
## Code Style: Lazy Senior Dev

The best code is the code never written. Before adding code, stop at the first rung that holds:

1. **Needed at all?** Speculative need → skip it and say so in one line.
2. **Already in this codebase?** Reuse the existing helper/util/pattern. Grep before writing.
3. **Stdlib does it?** Use it.
4. **Native feature covers it?** HTML/CSS/HTMX over JS, DB constraint over app code.
5. **Installed dependency does it?** Use it. Never add a new one for a few lines.
6. **One line?** Write one line.
7. **Only then** write the minimum that works.

Understand the task and trace the real flow first; the ladder runs after that, not instead of it.

- **Bug fix = root cause.** Grep every caller before editing; fix once in the shared place, not per caller.
- **No unrequested abstractions:** no interface with one implementation, no config for a constant, no scaffolding "for later."
- **Ship the simple version** and question it in the same message ("Did X; Y covers it. Need full X?") instead of stalling.
- **Mark deliberate corner-cutting** with `# simplified: <ceiling>, <upgrade path>` so it's greppable later.
- Never trade away validation, error handling, security, or accessibility for brevity.
- **Prose cap: max 4 short lines** after code or a result. Longer only when I ask for a walkthrough, review, or report.
```

**Why each part helps:**
- **The ladder:** the cheapest code is the code you don't write, and reuse beats new code.
- **Root cause:** one fix in the shared function beats a patch in every caller.
- **`# simplified:` tags:** known shortcuts stay findable instead of becoming surprises.
- **Prose cap:** shorter replies cost fewer output tokens and are faster to read. Change the number to taste.

**Subagents:** add this to every subagent brief, since they don't always read your `CLAUDE.md`: "Reuse existing helpers; add no new dependencies or abstractions beyond what's asked; mark deliberate simplifications with `# simplified:`."

**Want the full thing?** ponytail adds hooks, intensity levels (`lite`/`full`/`ultra`), and `/ponytail-review`, `/ponytail-audit`, and `/ponytail-debt` commands, and works with many agents. See its [README](https://github.com/DietrichGebert/ponytail) and benchmarks. Its hooks run on every prompt and subagent start, so read them before installing.

**Try it:** paste this into Claude Code:

```text
Add the "Code Style: Lazy Senior Dev" section from section 13 of
https://github.com/loneherd/claude-code-tips to my user-level CLAUDE.md
(~/.claude/CLAUDE.md). Show me the exact text before you write it, and don't
change anything else.
```

To undo, delete the section.

### 14. Voice Guide: Drafts That Sound Like You

Ask Claude to draft an email and you get "I hope this finds you well," bullet lists, and "Please don't hesitate to reach out." Nobody who knows you would believe you wrote it. A voice guide is a memory file built from your own sent mail. It tells Claude how you open and close by audience, which words you use, and which you never use. Claude reads it before every draft.

**What it is:** one memory file (see [Memory System](#8-memory-system)), plus one line in whatever skill or `CLAUDE.md` section handles drafting so Claude reads it first. Blank template: [`templates/voice-guide.md`](templates/voice-guide.md).

**Step 1: Get real samples.** You need your typed mail, not summaries. Claude in Outlook, or any assistant that can read your Sent Items, can pull it with this prompt:

```text
I want to build a style guide for how I write, so an AI assistant can draft messages that
sound like me. Please go through my Sent Items and pull real examples of my writing. Do not
rewrite, clean up, or summarize my words. I need them exactly as I typed them, typos included.

WHAT TO PULL
1. About 40 to 60 emails I sent, spread across different kinds of recipients: end users and
   staff, my teammates, my manager, executives, and outside vendors or support.
2. Prefer emails I clearly typed myself. Short replies, quick answers, and back and forth
   threads are best. Lean toward older mail, from before I started drafting with AI.
3. Skip automated messages, calendar invites, sharing notifications, forwards with no text
   from me, and mass templated notices.
4. If an email looks AI drafted (polished, heavily formatted, long bullet lists, phrases like
   "I hope this finds you well" or "please don't hesitate"), leave it out, or include it under
   a separate heading called LIKELY AI DRAFTED so I can see the difference.

FOR EACH EXAMPLE, GIVE ME
Date sent
Recipient type (end user, peer, manager, executive, vendor). Type only, no names or addresses.
Subject line
My text, verbatim, with quoted reply chains and my signature removed
Replace any password, key, account number, or other sensitive value with [REDACTED].

THEN GIVE ME YOUR OBSERVATIONS
Based only on the examples you pulled, and quoting them as evidence:
1. How I open and close emails, and whether that changes by audience.
2. Typical length and sentence length.
3. Words and phrases I use often.
4. Common words or phrases I never or almost never use, especially corporate or formal ones.
5. How direct I am when asking for something or saying no.
6. Punctuation and formatting habits (dashes, bullets, exclamation points, capitals, emoji).
7. How my tone shifts between end users, peers, my manager, executives, and vendors.
If you cannot tell something from the examples, say so rather than guessing.

Return everything as plain text in one response so I can copy it out.
```

No mail assistant? Export 50 or so sent emails to text files instead. Ticket notes and chat messages you typed also work.

**Step 2: Turn it into rules.** Paste the output into Claude Code with:

```text
Here is an analysis of my sent mail. Turn it into a voice guide memory using the template at
https://github.com/loneherd/claude-code-tips/blob/master/templates/voice-guide.md.
Before saving anything:
- Show me the draft rules.
- List any of my existing memories or CLAUDE.md rules that conflict with it.
- List habits from my mail you think should NOT be copied, and why.
Then wait for my answers.
```

**Step 3: Wire it in.** Add one line wherever drafting happens: a drafting or clipboard skill, or your `CLAUDE.md`:

```markdown
Before drafting anything sent under my name, read the voice-guide memory and check the draft
against its never-use list.
```

**What we learned building ours:**
- **Filter out AI-drafted mail.** If you have been drafting with Claude for months, a lot of your recent "sent" mail is Claude's voice. Learning from it just teaches Claude to copy itself. Older mail is safer.
- **Your mail will contradict old rules.** We had a "no greeting or sign-off" rule. The mail showed the greetings were typed by hand and only the signature block was automatic. The analysis caught a rule we had wrong.
- **Don't copy everything.** Typos, questions ending in a period, and trailing ellipses are real habits, but in a draft they look like mistakes. Gendered address like "sir" also stays out unless you add it yourself, since Claude can't know who the recipient is.
- **Audience matters more than vocabulary.** The biggest gain was per-audience openers and closers: no greeting for peers, status first for your manager, a warm close for executives and vendors.
- **The never-use list does the most work.** "Leverage," "circle back," "kindly," "Additionally," and "Best regards" mark a draft as generated faster than anything else.

**Try it:** run the Step 1 prompt, then paste the result into Claude Code with the Step 2 prompt.

To undo, delete the memory file and the line from Step 3.

---

### 15. `/delegate`: Route Work to the Cheapest Capable Agent

Left alone, the main session does everything itself: reads big files, rewrites docs, sweeps the repo, all at top-model prices. The `delegate` skill makes it split the work first, send each piece to the cheapest worker that can do it, manage the background agents, and check what comes back.

**Install:** copy [`skills/delegate/SKILL.md`](skills/delegate/SKILL.md) to `~/.claude/skills/delegate/SKILL.md`. Run it with `/delegate`, or add one line to `CLAUDE.md` so it applies by default: *"Before any multi-step or parallel work, use the delegate skill and state the split in one line."*

**What it does:**
- **Routes by job:** Haiku for mechanical sweeps and inventories, Sonnet for clear-step implementation and doc rewrites, Opus for hard debugging, design and security review. The lead session keeps planning, destructive steps, secrets and deploys.
- **Optional tiers:** if you run a local model (Ollama) it becomes the first rung, free and good for reading local files and boilerplate. If you have a paid external API (Gemini or similar) it becomes the last rung, and the skill asks before each billed call. With neither, the ladder is just Haiku, Sonnet, Opus.
- **Briefs with stop rules:** every agent gets a goal, exact paths, "stop and report if blocked, max 2 retries, never push or delete", secret-handling rules and a short report format. Code-changing agents get their own git worktree.
- **Manages the run:** background agents in parallel when they share no files, a cap of about 3, and a pause check (`ListAgents`, `SendMessage`, `TaskStop`) when one goes quiet.
- **Verifies:** reads the real diff and runs the tests instead of trusting a summary. In our first test a Haiku agent reported a branch as unmerged when it pointed at the same commit as `main`; the check caught it.
- **Reports in one line:** what went where, so you can see the savings.

**Why a skill:** a rule that only lives in memory or `CLAUDE.md` gets skipped when a task starts. A skill gives the model a procedure to run at the start of the task, which is when the decision matters.

---

### 16. `/voice`: Talk Instead of Type

Long prompts are faster to say than to type, especially a rambling "here's what I'm seeing, here's what I want" brief. `/voice` turns on dictation in the prompt box.

**Turn it on:** type `/voice`. Claude Code confirms with `Voice mode enabled (hold)`. Run `/voice` again to turn it off (`Voice mode disabled`).

**Use it:** hold the space bar to record, release when you're done, and your words land in the prompt. Review the text, then send it like any other prompt.

**Language:** dictation defaults to English. The confirmation line names the current language, and `/config` is where you change it.

**Tips:**
- Dictate the messy first draft of a task, then fix names, paths and commands by keyboard. Speech-to-text gets prose right and identifiers wrong.
- It pairs well with the [memory system](#8-memory-system) and `CLAUDE.md`: you can talk loosely because Claude already knows your conventions.
- Not to be confused with [tip 14](#14-voice-guide-drafts-that-sound-like-you), the Voice Guide, which is about how your *writing* sounds.

---

### 17. Parallel Sessions: Guard the Deploy, Not Just the Code

Running several Claude Code sessions at once on one repo works well when each session has its own git worktree: every session edits its own copy on its own branch, and PRs merge the work. But worktrees protect *editing*, not *deploying*. If your deploy script builds from the local folder it runs in, every session deploys whatever commit its own worktree happens to be on.

**What happened to us:** one session shipped a feature to prod. A few minutes later a second session deployed its own work from a worktree one commit behind, and the first feature silently disappeared from prod. Both sessions were "right" about their own code. Nobody was told.

**The fix: make the deploy script check three rules before it builds.**

1. **The tree is clean.** Uncommitted files (maybe another session's half-finished work) would ship.
2. **The commit is on `origin/main`.** Then "what's on prod" is always one commit you can look up.
3. **The commit contains the one prod runs now.** If it doesn't, deploying would roll someone back.

Rule 3 needs to know what prod runs, so the script writes a one-line record on the server after every deploy. Git answers "does this build contain that commit?" with `git merge-base --is-ancestor`.

```bash
stop() {
  if [ -n "$DEPLOY_OVERRIDE" ]; then echo "override ($DEPLOY_OVERRIDE): $1"; return 0; fi
  echo "STOP: $1"; exit 1
}

# Before building
git fetch -q origin main
HEAD_SHA=$(git rev-parse HEAD)
PROD_SHA=$(ssh deploy@prod-host 'cut -f1 ~/prod-deployed 2>/dev/null' || true)

[ -z "$(git status --porcelain)" ] || stop "uncommitted changes would ship"
git merge-base --is-ancestor "$HEAD_SHA" origin/main || stop "not on origin/main, merge the PR first"
[ -z "$PROD_SHA" ] || git merge-base --is-ancestor "$PROD_SHA" "$HEAD_SHA" \
  || stop "prod runs $PROD_SHA, which this build does not contain"

# ... build and deploy as before ...

# After a successful deploy: commit, UTC time, who, override reason (if any)
printf '%s\t%s\t%s\t%s\n' "$HEAD_SHA" "$(date -u +%FT%RZ)" "$(git config user.name)" "$DEPLOY_OVERRIDE" \
  | ssh deploy@prod-host 'cat > ~/prod-deployed && cat ~/prod-deployed >> ~/prod-deploys.log'
```

Change `deploy@prod-host` and the record path to yours. Keep the record outside the folder your deploy wipes.

**Why it's worth it:**
- **It can't be forgotten.** A rule in `CLAUDE.md` or memory only works if the session reads it at the right moment. A script check runs every time, for people and agents alike.
- **It costs no tokens.** It's a shell check, not a conversation. The rollback cleanup it prevents cost us several turns across two sessions.
- **Rollbacks still work.** Revert the bad commit on main and deploy; the revert is a new commit that contains everything before it, so rule 3 passes.
- **There's a way out on purpose.** Set `DEPLOY_OVERRIDE="<reason>"` to break a rule deliberately; the reason goes in the record.

**One catch:** if you deploy cherry-picked commits (say, to hold one PR back), those commits get new IDs that aren't on main, so the next normal deploy needs an override too. We now treat "prod deploys only from main" as the rule and the override as the exception.

**Sessions can also talk to each other.** In the Claude Code build we run, sessions on the same machine can list and message each other, and after the incident another session asked ours "what's on prod, and is it safe to build from main?" before it deployed. Naming sessions (for example with `/rename`) makes them easy to address. That coordination is useful, but the script check is what makes it unnecessary for deploys.

**Try it:** paste this into Claude Code in your repo:

```text
Read section 17 of https://github.com/loneherd/claude-code-tips. Add the same three
deploy checks and the prod record to my deploy script. Show me the diff before you write
it, keep everything else the same, and test each rule (clean tree, on main, contains prod)
without running a real deploy.
```

To undo, remove the checks and the record lines from the script.

---

### 18. Code-Rendered Video Workflow

Claude can't output an MP4, but it can write a program that a headless browser renders frame by frame. The [`video/`](video/) folder is the whole kit: Remotion rig notes, brief / style guide / shot list templates, a critic prompt, QA scripts and a procedural-audio helper. Copy it to a new machine and the workflow comes with it.

**The loop:** write a brief with real assets, then a style guide and shot list, then render stills into a contact sheet, then a fresh agent scores the sheet and you fix the worst 3 defects, then QA (determinism, blank frames, phone-size readability, loop point) and deliver one 1080p file.

**Start here:** [`video/README.md`](video/README.md). Drop [`video/templates/CLAUDE.video.md`](video/templates/CLAUDE.video.md) into the project root as `CLAUDE.md` for the house rules.

---

### 19. `/tokenwatch`: Measure Token Burn, Don't Guess

Claude Code writes the exact token usage of every turn into its transcript files under `~/.claude/projects/`. [`scripts/token-usage-report.py`](scripts/token-usage-report.py) reads them and reports, per model and per lane (main session vs subagents): turns, cache reads, cache writes, output, dollars, and **$/turn**. The [`/tokenwatch`](skills/tokenwatch/SKILL.md) skill runs it and turns the result into one change to make.

**What measuring changed for us:** we assumed big files were the problem. The first report said `CLAUDE.md` and memory together were about 1% of the bill. Re-reading conversation history every turn was 64%, because sessions grew to almost a million tokens of context before anything compacted them. One setting, `autoCompactWindow`, was the biggest lever.

**The levers, in the order they paid off:**

1. **`autoCompactWindow`** in `~/.claude/settings.json` (we use `300000`). On a 1M-context model the default lets a session grow far past the point where every turn is expensive.
2. **`CLAUDE_CODE_SUBAGENT_MODEL`** (we use `sonnet`) in the `env` block. Without it a subagent inherits the main model, so handing work to an agent saves nothing.
3. **A `CLAUDE.md` rule to keep tool output small** (below). Every token a tool returns is written to cache once and re-read on every later turn.
4. **Effort** at `medium` for routine work, as in section 11.

```markdown
- **Keep tool output small.** Every token a tool returns is written to cache once and re-read
  on every later turn. Read the lines you need, not the whole file; use `head`, `--limit`,
  `-n`, filters, and `--quiet` flags; send bulky output to a subagent. Never trim so far that
  the evidence for a decision goes missing.
- **Prefer parallel subagents when a task splits** into bulky, independent pieces that need
  little of the current context. Stay inline for small pieces or steps that each need the
  previous step's output. Each agent pays its own startup cost, and anything it must re-read
  is paid twice.
```

**Track $/turn, not total spend.** Total moves with how much work you did that week. $/turn shows whether the configuration is working. Every run appends to `token-usage-history.csv`, which matters because Claude Code deletes transcripts after `cleanupPeriodDays` (30 by default). Our main-session cost went from $0.243/turn (September) to $0.089/turn (October). That includes a model change as well as the settings, so it isn't the settings alone.

**Two measurement bugs we hit, so you don't:**
- **Subagent transcripts live in `<session>/subagents/*.jsonl`**, not beside the session file. Read only the top level and subagent turns show as 0 even when offload works.
- **Claude Code main sessions write 1-hour cache entries, which cost 2x input**, not the 1.25x of 5-minute writes. Price them all at 1.25x and the cache-write line comes out far too low.

**Keep prices current.** The `PRICES` table in the script is a snapshot. Check current rates before trusting a total; the script warns about any model it has no price for.

**Try it:** copy `scripts/token-usage-report.py` somewhere stable and `skills/tokenwatch/` to `~/.claude/skills/`, then ask Claude Code "how are we doing on tokens?" Run it again a day after any settings change, and compare $/turn.

---

### 20. Weekly Maintenance: A Self-Renewing Check-In

Some things only get checked when someone remembers to: due dates buried in memory notes, a "temporary" change that never got reverted, worktrees left behind, a memory index growing past budget. We put them in one file and have Claude ask us about them every Tuesday morning.

**Two parts:**

1. **A checklist file**, [`templates/weekly-maintenance.md`](templates/weekly-maintenance.md). Each `##` section is one item: token review (section 19), due-date sweep, temporary changes still open, credential rotations owed (names only), things waiting on you, leftover worktrees, memory hygiene. To add an item, edit the file; the reminder doesn't change.
2. **A one-shot durable scheduled task that re-schedules itself.** Recurring scheduled tasks expired after 7 days in the build we run, so a weekly recurring job wouldn't last. Instead each run creates the next one, 7 days out.

**The reminder prompt** (create it once with "schedule this as a durable one-shot task for next Tuesday 09:07"):

```text
WEEKLY MAINTENANCE (self-renewing reminder).

Step 1 - read <workspace>/.claude/weekly-maintenance.md. Then ask first, do nothing else yet:
"Weekly maintenance is due." List each ## item by number and title, and ask which to run
(all / pick numbers / none / snooze N days).

Step 2 - schedule the next one no matter the answer: a durable, non-recurring task for 7 days
after today at 09:07 local (or N days if snoozed), with this exact same prompt text. Confirm
it is listed. Never skip this step; it is what keeps the weekly cycle alive.

Step 3 - run only the items picked, exactly as each section in the file describes.
Independent items can run as parallel subagents. Report per item, then one action list of
anything that needs a decision. Change nothing beyond what an item says without approval.
```

**Why it's built this way:**
- **It asks first.** A reminder that runs everything on its own gets ignored or does things you didn't want that day.
- **Step 2 runs whatever you answer**, including "none". Skip it and the chain is gone.
- **Items stay local.** Ours read memory and local disk only, with no SSH, APIs, or databases, so the check-in is fast, cheap, and safe to say yes to. Live-system health checks belong in monitoring, not a chat reminder.
- **Report, don't fix.** Every item proposes; nothing changes without an OK.

**Catches:** the task fires only while a Claude Code session in that folder is open and idle. If a week passes with no prompt, the chain broke: list scheduled tasks and re-create it from the prompt above. With several sessions open you may get it more than once; delete the extras.

**Try it:** copy `templates/weekly-maintenance.md` to `<workspace>/.claude/`, trim the items to what you use, and paste the prompt above into Claude Code with "schedule this as a durable one-shot task for next Tuesday 09:07".

---

## Fable

### 21. Fable Plans, Opus Builds, Haiku Fetches

Fable 5.2 is the strongest planner and reviewer, and it costs about 2.5x Opus 5.5 per token. Put it in charge and let cheaper models do the reading and typing. The catch: subagents inherit the main model unless told otherwise, so a Fable session quietly runs every subagent on Fable too.

**The setup:**

1. Open Claude Code, type `/model` and pick Fable 5.2.
2. Set `CLAUDE_CODE_SUBAGENT_MODEL` (to `opus`) so new subagents don't default to Fable.
3. Save each subagent in `.claude/agents/` with its own `model:` field:
   - log reading and file search on **Haiku**
   - scoped fixes and test writing on **Sonnet**
   - planned multi-file build work on **Opus**
4. Run `/init` first in a repo with no `CLAUDE.md`, so it writes one about your repo.
5. Shift+Tab into plan mode before it touches a file, then give it the big job.
6. Start at medium effort. Go high only when it struggles.
7. Run `/tasks` to see which model every subagent is on.
8. `/compact` when the context gets heavy, `/clear` between jobs.

**The one rule that matters:** edits and judgment calls stay on the main model, never the cheap one. Haiku is great at "find every caller of X" and bad at deciding whether X should change.

```markdown
---
name: fetcher
description: Read-only lookups - reading logs, finding files, "where is X used". Returns facts with file:line.
tools: Read, Grep, Glob, Bash
model: haiku
---
```

**Why it works:** most of a big job is reading, and reading is where the tokens go. The lead only sees short summaries, so its context stays small and its turns stay cheap, while the expensive model spends its tokens on the plan and the review.

---

### 22. `/fable-setup`: A Fable Workspace in One Command

Doing section 21 by hand every time gets old, and settings you set in one session don't follow you to the next. `/fable-setup` builds a subfolder that carries all of it, so any session started there is already set up.

**Install:** copy [`skills/fable-setup/`](skills/fable-setup/) (the `SKILL.md` and its `templates/` folder) to `~/.claude/skills/fable-setup/`. Fill in your memory folder path once in `templates/CLAUDE.md`.

**Run it:** `/fable-setup <name> [repo]`. It creates `<name>/` with:
- `.claude/settings.json`: Fable 5.2 main, effort medium, `CLAUDE_CODE_SUBAGENT_MODEL=opus`
- `.claude/agents/`: `fetcher` (Haiku, read only), `fixer` (Sonnet, scoped fixes and tests), `builder` (Opus, planned build work)
- `CLAUDE.md`: Fable leads and reviews every diff, agents get self-contained briefs and separate file scopes, they write details to `findings/` and return short summaries, and parallel agents never build in a shared tree
- `repo/` (optional): a git worktree of the repo on its own `fable/<name>` branch, so the main checkout is never touched

Then open a new terminal in the folder, run `claude`, check the status line says Fable 5.2, Shift+Tab into plan mode, and give it the job.

**Why a folder:** project settings and agents load from the folder the session starts in. A new folder also starts with no memory, so the template points the session at your main memory.

---

## Quick Reference

### Session Management

| Command | What it does |
|---|---|
| `claude --resume` | Pick up your most recent session |
| `claude --continue` | Continue last conversation (no selection prompt) |
| `/clear` | Reset conversation context mid-session |
| `/compact` | Compress context to free up token space |
| `/cost` | Show token usage and cost for this session |
| `/model` | Switch model mid-session |
| `/fast` | Toggle fast mode (same model, faster output) |
| `/config` | Open settings |
| `/voice` | Toggle dictation: hold space to record (see [tip 16](#16-voice-talk-instead-of-type)) |

### Running Modes

| Command | What it does |
|---|---|
| `claude` | Interactive mode |
| `claude "prompt"` | Start with an initial prompt |
| `claude -p "prompt"` | One-shot — runs and exits |
| `claude -p "prompt" < file.txt` | One-shot with piped input |

---

## File Structure

```
claude-code-tips/
├── README.md              # This file
├── scripts/
│   ├── statusline.ps1     # Custom status line script (PowerShell)
│   └── token-usage-report.py  # Token burn report from transcripts (section 19)
├── skills/
│   ├── wrap/SKILL.md      # /wrap session checkpoint skill
│   ├── delegate/SKILL.md  # /delegate agent routing + management skill
│   ├── fable-setup/       # /fable-setup workspace skill + templates (section 22)
│   └── tokenwatch/SKILL.md  # /tokenwatch token usage check (section 19)
├── templates/
│   ├── voice-guide.md     # Voice guide memory template (section 14)
│   └── weekly-maintenance.md  # Weekly check-in items (section 20)
├── video/                 # Code-rendered video workflow (section 18)
│   ├── README.md
│   ├── scripts/           # stills, qa, determinism, beats, synth helpers
│   └── templates/         # brief, style guide, shot list, critic prompt, checklist
└── LICENSE
```

---

## Resources

- [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code) — Official documentation
- [Claude Code GitHub](https://github.com/anthropics/claude-code) — Report issues, check releases
- [claude-code-mods](https://github.com/loneherd/claude-code-mods) — The mods from section 12
- [ponytail](https://github.com/DietrichGebert/ponytail) — Source of the ladder in section 13
- [Sub-agents docs](https://docs.anthropic.com/en/docs/claude-code/sub-agents) — `.claude/agents/` files and the `model:` field (sections 21-22)


---

## Contributing

Found a tip that saves you time? Open a PR. Keep it practical — show the problem, then the solution.

## License

[MIT](LICENSE)
