# Current work

## Destination
Complete the approved GitHub profile upgrades and repair EV fuel provenance and dependency gating.

## Frontier
- [x] Reproduce fuel bug and cover discovery, dates, invalid rows and fallbacks.
- [x] Repair current-series discovery and source freshness; show provenance in UI.
- [x] Patch Next.js/Vitest and transitive dependencies; zero runtime audit findings.
- [x] Restore blocking moderate gate with one expiring development advisory exception.
- [x] Local 28 tests, lint, TypeScript, build and 8 E2E checks passed.
- [x] Independent Gemini 3.8 Flash High review completed without concrete blockers.
- [ ] Publish changes and inspect CI/E2E/CodeQL on the new commit.
- [ ] Verify the deployed fuel endpoint and visible source readout.

## Fog of war
Hosted state is not inferred from a local build. Account bio/pins/settings require GitHub browser sign-in; existing PAT gets 403 for those edits.

## Blockers
None for source work; publication/deployment checks pending.
