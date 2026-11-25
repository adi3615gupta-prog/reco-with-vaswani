---
name: gsd
description: >-
  Get Shit Done (GSD): Meta-prompting, context engineering, and spec-driven
  development system. Provides the 5-phase execution loop (Discuss → Plan →
  Execute → Verify → Ship), milestone management, and specialized subagents to
  eliminate context rot and drive disciplined AI engineering.
argument-hint: "[command|phase|quick <task>|help]"
---

# Get Shit Done (GSD)

Get Shit Done is a lightweight, spec-driven development and context-engineering framework designed to prevent context rot and ensure high-velocity, reliable software delivery with AI assistants.

---

## The 5-Phase Execution Loop

Every non-trivial feature or milestone moves through five disciplined phases:

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│  Discuss  │ ──► │   Plan    │ ──► │  Execute  │ ──► │  Verify   │ ──► │   Ship    │
│ Decisions │     │  PLAN.md  │     │ Atomic Wk │     │ Test/UAT  │     │ PR/Merge  │
└───────────┘     └───────────┘     └───────────┘     └───────────┘     └───────────┘
```

1. **Discuss (`/gsd-discuss-phase`):** Resolve critical implementation choices and technical tradeoffs *before* planning code changes.
2. **Plan (`/gsd-plan-phase`):** Research the codebase, decompose requirements into structured `PLAN.md` tasks, and pass plan verification.
3. **Execute (`/gsd-execute-phase`):** Run tasks across parallel or wave-based executions with clean context windows and atomic commits.
4. **Verify (`/gsd-verify-work`):** Rigorously test and diagnose implementations against specifications before declaring completion.
5. **Ship (`/gsd-ship`):** Prepare pull requests, generate release summaries, and close out the milestone loop.

---

## Core Command & Skill Reference

All individual GSD skills are registered as slash commands in Antigravity:

### Project & Milestone Initialization
| Command | Description |
|---|---|
| `/gsd-new-project` | Initialize `.planning/` directory, project goals, and phase roadmap |
| `/gsd-new-milestone` | Start a new milestone in an existing project |
| `/gsd-phase` | Add, insert, reorder, or edit phases in `ROADMAP.md` |
| `/gsd-progress` | View current milestone completion status and next pending tasks |
| `/gsd-health` | Run health and consistency checks on project planning state |

### Planning & Execution
| Command | Description |
|---|---|
| `/gsd-discuss-phase <N>` | Clarify scope and record architectural decisions for phase `N` |
| `/gsd-plan-phase <N>` | Generate granular task plans (`PLAN.md`) with automated plan checkers |
| `/gsd-execute-phase <N>` | Execute all tasks in phase `N` using wave-based parallelization |
| `/gsd-verify-work <N>` | Run verification tests, detect gaps, and generate gap closure plans |
| `/gsd-ship` | Create PR, summarize changes, and archive completed phases |

### Fast Path & Debugging
| Command | Description |
|---|---|
| `/gsd-quick <task>` | Execute quick, ad-hoc changes with full GSD rigor and verification |
| `/gsd-debug <issue>` | Structured debugging workflow to isolate, fix, and verify regressions |
| `/gsd-code-review` | Perform automated multi-perspective code review on current diffs |
| `/gsd-help [topic]` | Display interactive GSD command reference and guide |

---

## Project Structure (`.planning/`)

When GSD is initialized in a project, it maintains state under `.planning/`:

```text
.planning/
├── PROJECT.md         # Architecture, constraints, and project boundaries
├── REQUIREMENTS.md    # Scoped functional and technical requirements
├── ROADMAP.md         # Milestone phases, phase status, and dependencies
├── STATE.md           # Active working state, decisions, and memory
└── phases/            # Granular phase definitions, plans, and verification
    ├── 01-setup/
    │   ├── CONTEXT.md
    │   ├── PLAN.md
    │   └── VERIFICATION.md
    └── ...
```

---

## Under the Hood & CLI Tools

- **CLI Utility:** `gsd-sdk` is available in your terminal (`gsd-sdk run`, `gsd-sdk auto`, `gsd-sdk init`).
- **Workflows:** Pre-compiled workflows live in `~/.gemini/antigravity/get-shit-done/workflows/`.
- **Specialized Agents:** Specialized persona agents live in `~/.gemini/antigravity/agents/`.
