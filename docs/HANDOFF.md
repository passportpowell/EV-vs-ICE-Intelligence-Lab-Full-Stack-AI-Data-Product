# Current Handoff
<!-- OVERWRITE this file; keep <= ~60 lines. Current state only; history goes in SHARED_NOTES.md. -->
- Project: EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product
- Updated by: Antigravity; Gemini 3.8 Flash; high; Antigravity
- Updated at: 2026-10-11T12:15:00Z
- Root: .
- Branch: main
- HEAD: aafffc5ed385099c821fc7921567bc9421a5f6f6
- Status: READY
- Tree: changes ready to commit (pipeline fix, CI fix, footer link, project skills, agent protocol files)
- Workspace ID: pending
- Routing: deterministic direct execution
- Usage: not measured

## Objective
Fix GitHub Actions `Refresh data` workflow crash caused by joblib `OSError: [Errno 28] No space left on device` during `permutation_importance` step in `train_cost_model`.

## Done
- Cloned repo to `N:\Otis Projects\EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product`.
- Set up Base Prompts & Skills protocol (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/HANDOFF.md`, `SHARED_NOTES.md`).
- Installed skills into `.agents/skills` via `install-project-skills.ps1`.
- Root-cause analyzed workflow run 38131189061: `loky` backend filled `/dev/shm` from `permutation_importance(n_jobs=-1)` on 28.8k rows with nested parallelism.
- Updated `pipeline/ev_ice_pipeline/build.py` with `n_jobs=1`, `max_samples=2000`, and `n_repeats=5` (runs sub-3s vs 84+s, no memory leak).
- Updated `.github/workflows/refresh-data.yml` and `ci.yml` with `JOBLIB_TEMP_FOLDER: /tmp` and removed duplicate install step.
- Built dataset and SQLite database locally via `python -m pipeline.ev_ice_pipeline.build`.
- Implemented global rule footer with GitHub icon linking to `https://www.passportpowell.com/card`.
- Verified `pytest tests/python` (3/3 passed, 139s down from 217s).
- Verified `npm run test` (9/9 Vitest passed).
- Verified `npm run lint` (0 errors).

## Next steps
1. Review `git status` / `git diff`.
2. Stage and commit changes.
3. Push to `origin/main` when user confirms.

## Tests
- Passed: `pytest tests/python` (3/3 passed), `npm run test` (9/9 passed), `npm run lint` (0 errors).
- Failed: None.

## Gotchas / do not undo
- Never use `n_jobs=-1` on `permutation_importance` when the underlying model already has parallel estimators, as loky memmaps to `/dev/shm` on Linux and runs out of tmpfs space.
- Keep footer GitHub icon linking to `https://www.passportpowell.com/card` per machine instructions.

## Blockers / errors
None.
