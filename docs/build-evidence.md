# Build evidence and limits

Updated 24 September 2026. Source, offline tests, workflow triggers and hosted acceptance are different evidence classes.

## Workspace refresh

| Commit | Source delivered | Recorded bounded checks |
| --- | --- | --- |
| d492f5b | Authentication refresh and MCP token validation | See authentication implementation notes |
| 334f3dd | Workspace shell and guide | Frontend build and whitespace |
| 3b61877 | Location/device catalog and Simulation Studio | Frontend build, 25 Python regressions, three JavaScript checks, Terraform formatting |
| f760f62 | Evidence revisions and human review | Frontend build, 35 Python regressions, Terraform formatting |
| 1ddb0d8 | Alexa coordination and assessment-bound approval | Frontend build, 36 Python regressions, six JavaScript checks, Python compilation |
| f186c70 | Guarded cleanup and data controls | Frontend build, 44 Python regressions, Terraform formatting |

Counts are snapshots of each phase, not additive totals. These are recorded local implementation checks; AWS persistence tests use mocks. They do not establish hosted concurrency, real model quality, accessibility certification or fresh-install reproducibility.

[Phase 8 workflow](https://github.com/tanvir4hmed/aenea/actions/runs/35946633648) was observed triggered/in progress. Completion was not checked. The earlier [foundation run](https://github.com/tanvir4hmed/aenea/actions/runs/35198485841) is historical, not evidence that the current release works.

Phase 9 is documentation-only. It reviews official entry requirements, current source/UI labels, public repository/license metadata and contribution dates. No application deployment or hosted test is implied by its push.

## Still to capture

Final deployed commit/run; clean-browser guest access; actual MCP call; signal-to-model-to-policy trace; revision/race refusal; permitted virtual action and failure outcomes; account isolation; complete scheduled deletion; final public video. Keep credentials and real personal information out of evidence.

Use [release gates](release-checklist.md) to record actual acceptance, and [phase notes](workspace-refresh.md) for implementation detail.
