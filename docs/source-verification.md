# Source verification — 30 September 2026

## User guide and retired-code removal — 6 October 2026

The in-app guide now provides eight expandable setup/use steps, a visual first-test sequence, prerequisite/outcome table and troubleshooting. [The standalone user guide](user-guide.md) covers the same workflow, including device configuration, saving versus triggering, repeat runs, Alexa+ controls, review/resolution and deletion dependencies.

Removed the disabled action executor logic, response permission endpoints, action MCP tools, unused policy Lambda/source/IAM wiring, feature flag, actuator evidence helper and unreferenced response/old scenario UI. The existing `action_executor` Lambda resource name is retained because it also serves working catalog, simulation and lifecycle APIs; its workflow entry now publishes briefings only. Historical record reads, catalog compatibility and the empty `actions` wire field remain intentional compatibility boundaries. New assessments reject nonempty device commands. No application data was deleted.

Offline checks: the full 170-test Python suite passed, followed by two new Settings/catalog and briefing handler regressions; 54 JavaScript tests, web lint/production build, Python correctness/unused-import checks, repository formatting, five-module strict typing, Terraform formatting and diff checks passed. The actual MCP HTTP app verifies five advertised tools and the absence of action tools. The SDK emits an existing Starlette test-client deprecation warning. These are source/offline checks; no hosted UI, native Alexa integration or cloud deployment acceptance was performed. Main-path selective deployment wiring remains enabled.

## Device-first Alexa+ follow-up — 2 October 2026

Current scope is documented in [device-first experience](device-first-experience.md). Device list/add tabs, inline location creation, compact location management, unified Ask panel, signal-to-selected-map navigation and readable fallback names replace the previous response-control UI. Device execution and new proposals are disabled at the server boundary as well as removed from the UI. Historical records remain readable.

Offline verification: 175 Python tests, 52 JavaScript tests, frontend lint/build, repository Python correctness/format checks, five-module strict typing and Terraform formatting passed. The retained legacy action tests explicitly opt in; new tests verify disabled policy/execution cannot read or mutate device state. UI fixture checks exercised blank setup, atomic device/location creation, edit/delete to empty, typed question rendering, signal-to-map focus, desktop Ask positioning and 390px mobile layout without horizontal overflow or console errors. Fixture replies are labelled, not hosted AI evidence. Initial entry JavaScript is approximately 266.5 kB (84.6 kB gzip), not a measured hosted latency result.

AWS administrator login was expired during this work. No application data was deleted and no infrastructure reset was performed. Hosted deployment, real authentication/microphone and cloud acceptance are not established by these checks; push is the release handoff.

## UI follow-up — 1 October 2026

Simulation Studio now separates Create and Saved simulations. Incident history opens as a searchable location/status list, ten loaded incidents per page, with separate overview/actions, evidence and decision-review sections after selection. Deletion is available on the incident detail header and uses the existing guarded cleanup API. Evidence renders ten loaded records per page; raw records remain collapsed. Filters and sorting cover loaded records; additional server pages are explicit, not silently represented as a complete global search.

Removed simulation-run polling's implicit incident-selection callback, which could replace a manually chosen Alexa incident when the run panel remounted. Manual selection now updates the active request reference immediately, rejects stale timeline responses, and prevents automatic reselection after clearing the picker.

Frontend lint, all 34 JavaScript tests and production build pass. Local browser fixture checks verified 23-incident pagination, search, opening detail sections, evidence pagination, and the disabled deletion confirmation/cancel flow. No live incident was deleted. Hosted selection behavior and full responsive acceptance were not reverified. See [scheduler cost estimate](scheduler-cost.md); scheduler cadence and infrastructure are unchanged.

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
