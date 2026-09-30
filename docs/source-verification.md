# Source verification — 30 September 2026

Phases 4–6 source implementation is complete. This report is **offline evidence**, not deployment, Alexa certification or physical-device verification.

## Checks

- Aenea: 142 Python regression tests and 34 JavaScript tests pass. Tests exercise simulated AWS persistence, actual ingestion/correlation handlers, MCP HTTP/auth boundaries, routing, deletion, retry identities, scheduler limits, policy, signal tiers and stale-action refusal.
- Whole-repository Python correctness lint/format checks pass; strict typing passes for the five declared core modules. Dynamic AWS persistence boundaries are not claimed fully strictly typed.
- Frontend lint and production build pass: JavaScript 319.20 KB (97.22 KB gzip), CSS 15.49 KB (4.15 KB gzip). These are bundle sizes, not measured application latency.
- Terraform recursive formatting passes. This does not replace provider validation, IAM reconciliation or a hosted apply.
- IncidentBridge's safety/security signal contract: 40 tests, lint, formatting, strict types and source/wheel packaging pass.

New coverage includes repeat and clear schedules, fresh incident allowances, exhausted-generation pause/resume, same-ID retries, overlapping runs, single-definition uniqueness, named selection conflicts, same-location actions, cross-incident hazard vetoes, optional note revisions, material briefing deduplication, real command scope propagation, worker failure recovery and cleanup after an uncertain ingestion response.

## Browser checks

Used an isolated local fixture displaying the real frontend components, not fabricated cloud outcomes. Checked desktop 1280×900 and mobile 390×844: no horizontal overflow, associated form labels, readable briefing control, separated Alexa fields and retired navigation absent. Map selection and multi-selection produced distinct-device/expected-signal counts. Repeat mode exposed its interval controls; optional note draft survived reload. No fixture console errors/warnings were observed.

The fixture and in-memory preview server are under `tests/ui-preview.jsx` and `scripts/preview_ui.mjs`, not the production entry point. Screenshot evidence is kept in the owner's planning workspace rather than the submission repository. No real sign-in, microphone permission, voice playback or native Echo session was verified in this fixture.

## Rollout and remaining gates

1. An administrator must reconcile bootstrap IAM to include the exact `aenea-simulation` default-bus rule before the deployment role can create the scheduler. The source policy is updated; live IAM was not changed in this work.
2. Push triggers component-selective deployment; this work does not wait for or certify its result. Confirm hosted scheduler invocation, permissions, model access, resource-bound sign-in/refresh and final browser-to-cloud actions separately.
3. Cloud scheduling uses minute ticks and bounded delivery batches, not real-time guarantees. Large-history read costs and concurrency/load behavior require hosted measurements. A run spanning several locations stops if an associated incident is resolved/deleted.
4. Browser briefings cover the selected incident while the page is open; speech is not an always-on Echo announcement service. Cloud processing itself does not depend on the page remaining open.
5. Full runtime transitive dependency locks, comprehensive accessibility audit and native integration testing remain release hardening. Existing direct pins, lockfile and scoped type gates are not a claim that every dependency or code path is certified.
6. Before submission, recheck official rules, provide real hosted evidence/video and finish the operator checklist. No member registry or emergency calling is included.

See [current behavior](state-driven-coordination.md) and [release checklist](release-checklist.md).
