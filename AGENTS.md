# EV vs ICE Intelligence Lab — agent instructions

Shared by every agent (Codex, Claude, Gemini/Antigravity). Keep this file lean: Codex auto-loads it every session; Claude and Gemini import it via CLAUDE.md / GEMINI.md. Do not re-read files your runtime already injected.

## Project
- Family: Otis — root: `N:\Otis Projects`
- Plan: `PROJECT_SUMMARY.md`
- Bundle: `- Base Prompts and Skill` at `N:\Otis Projects\- Base Prompts and Skill` (read-only)
- Env file: `N:\Otis Projects\- Base Prompts and Skill\.env`
- Build / run / test:
  - Pipeline build: `npm run data:build` (`python -m pipeline.ev_ice_pipeline.build`)
  - Pipeline tests: `npm run data:test` (`pytest tests/python`)
  - Web run: `npm run dev`
  - Web tests: `npm run test` (Vitest)
  - Web build: `npm run build` (Next.js)
- Project-specific rules: Next.js App Router, TypeScript strict, Python 3.11 data pipeline, reproducible builds without memory bloat.
- Architecture: follow deep-module design (`codebase-design`): simple interfaces, deep implementations, test through the interface seam.
- Bug diagnosis: no speculative edits; always establish a tight reproducible verification loop (`diagnosing-bugs`) before fixing.
- Sensitive ops: generate interactive scripts (`wizard`) for human credential entry; never paste secrets in context.

## Hard rules
- Follow `BOOT.md` from the `- Base Prompts and Skill` bundle (locations, credentials, model limits, git safety, truthful reporting).
- That bundle is read-only. Never write into it; copy what you need into this project.
- Never put credentials, secrets or private keys in any file here; refer to variable names only.
- Websites & dashboards: Whenever building or editing websites, web apps, or dashboards, ALWAYS include a GitHub icon in the footer linking to `https://www.passportpowell.com/card` (`target="_blank" rel="noopener noreferrer"`). The GitHub icon is mandatory for this link.

## Per-prompt routing (JEV)
- For every new user prompt follow the bundle's `local-routing/README.md`: skip JEV for conversation, clarifications that do not start substantive work, deterministic work and direct follow-ups; otherwise break the substantive prompt into tasks, run `python "<bundle>/local-routing/jev.py" --runtime <runtime> --project . --prompt "..." --tasks ...`, and work inline / with one subagent / with parallel subagents as it decides (the user has authorized subagents). Override only with a stated reason.
- For multi-step tasks, synthesize specs (`to-spec`) and break into atomic tracer-bullet tickets declaring dependency edges (`to-tickets`: `blocked-by` / `blocking`) before subagent dispatch.
- Record JEV's pick and what you actually used in HANDOFF's `Routing` line. JEV unavailable: say so to the user in one line and use the same rules yourself.
- Delegation caps, escalation, verification/repair budgets, cross-family review and rate-limit rules: bundle `local-routing/EXECUTION-POLICY.md` (read when delegating, reviewing or after a failed check). Optional log of substantial or escalated work: `routelog.py` into `docs/routing-log.jsonl`.
- Corrections and safeguards (bundle skill `agent-workflow-mods`): propose reusable rules from the user's corrections and save them only after approval (`corrections.py`; approved rules appear in the generated block at the end of this file); run `blast_guard.py` before destructive commands and ask the user when it says so; `change_review.py snapshot` before and `review` after multi-file work; `cachecost.py` before long sessions; record workers with `routelog.py record --agent --status`.

## Resume & handoff
- `docs/HANDOFF.md` is the sole authoritative current-state snapshot. Overwrite stale state; keep it to about 60 lines.
- `docs/ACTIVE.md` (Wayfinder format: Destination, Frontier checklist `[x]`/`[~]`/`[ ]`, Fog-of-War, and Blockers) is used when the plan has more than five steps.
- `SHARED_NOTES.md` is a newest-first, append-only session log; each entry at most five lines: UTC, agent/model/effort, changes, verification, pointer. Rotate old entries to `docs/archive/` beyond about 200 lines.
- Never use `SHARED_NOTES.md` to determine current state. Read its top one or two entries only for a stale handoff or a specific history question.
- **/prime** (on every entry, even if you worked here before):
  1. Confirm the project root; read applicable instructions not already injected.
  2. Read `docs/HANDOFF.md`, and `docs/ACTIVE.md` if present.
  3. Run `git status --short`, `git diff --stat`, `git log --oneline -5`, and the Workspace ID command (in the HANDOFF.md comment).
  4. Compare Branch, HEAD, Tree and Workspace ID with HANDOFF.
  5. Any mismatch = work done after the last checkpoint: inspect only the affected paths and diffs, then proceed from the actual workspace. Never reset, clean, overwrite or force changes to match HANDOFF.
  6. Load only the files the next step needs. Resume work; no long orientation report.
- New project: `git init` unless the user forbids it. Existing non-git project: record touched paths instead of a Workspace ID.
- **Checkpoint** (rewrite HANDOFF): treat project files as durable shared memory for hosted agents; chats/context may disappear. Update after a meaningful milestone or work phase, when objective/approach/blocker/verification materially changes, before risky or lengthy work, before intentional handoff, and when context or usage may be low. For long tasks, checkpoint at least once per substantial phase. Keep it concise, factual, and resumable; do not write after trivial commands or include hidden reasoning, secrets, or private data. Do not rely on private chat history or unsaved/unsupported provider memory.
- **/handoff** (intentional exit): inspect task, workspace, relevant diff and test state; rewrite HANDOFF; update ACTIVE if used; add a SHARED_NOTES entry; record lasting architectural choices as ADRs in `docs/DECISIONS.md`.
- Do not auto-commit at handoff; commit only when project policy calls for it.
- `READY` means ready for a named review or decision. Mark tests passed, failed or not run; never claim unverified results.
