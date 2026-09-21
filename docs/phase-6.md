# Phase 6 — household simulation and demo experience

Source implemented on 21 September 2026. Local application builds, hosted acceptance, visual QA and timed rehearsal remain deferred by project-owner instruction. This is implementation evidence, not a claim that the 2:45–2:55 demo has passed repeatedly.

## Implemented

- Simulation lab includes three authored scenarios: smoke plus ambiguous camera motion, water leak with explicit valve approval, and camera-only context. Each run receives a new incident ID and each step a new event ID/fresh timestamp. The operator sends steps individually through the actual ingestion API and IncidentBridge adapter.
- Input cards explicitly identify synthetic camera events, not footage, Ring API data, identity recognition or occupancy verification. No recorded backend result is replayed.
- An uncertain scenario write retains its exact payload for manual retry while navigating within the app. A full page reload loses this in-memory pending payload; inspect saved history before starting another run. Starting a new run never deletes previous incident history.
- Household view reads and writes the same incident-scoped MCP self-reports as the Alexa simulator, with timestamps, paginated results, unknown-state wording and fictional-name prompts. A saved check-in and its audit commit atomically in the backend.
- Handoff view prepares a timestamped, explicitly synthetic snapshot through MCP. Separate bounded queries retrieve signals, current action records and people; the latest assessment is fetched by its saved ID so an arbitrary timeline page cannot silently hide it. The partial flag covers all queried pages. The multi-read snapshot is not transactionally frozen: refresh before sharing.
- Handoff includes assessment uncertainty, action failure/alternate plan, signal provenance and evidence IDs. Copy and print are user-initiated. There is no monitoring-service integration, automatic sharing or emergency dispatch.
- Existing virtual-device failure controls now offer a reload button for persisted permissions and consumed failure flags. Missing settings display disabled instead of implying saved authorization. Failure must be configured before an eligible action; an unproposed action is not a passed failure demonstration.
- Responsive cards, forms, focus indicators, navigation state and handoff print styles are implemented. No third-party media or additional frontend package was added; visual QA is still pending.

## Demo preparation

Follow [the timed demo runbook](demo-runbook.md). It identifies the exact setup, expected observations and failure branches without inventing evidence. The canonical v1 architecture image is unchanged.

Hosted prerequisites inherited from Phases 4–5: refresh the AWS administrator login and synchronize bootstrap IAM permissions, allow GitHub deployment to finish, sign out/in for the resource-bound Cognito token, and create/use an authorized demo user. This phase adds no AWS resource, domain or credential requirement. Frontend and shared Lambda edits trigger their existing selective deployment paths; neither the AgentCore package nor infrastructure needs rebuilding for this phase's changes.

## Deferred acceptance checklist

- [ ] All scenario inputs enter the real backend, with no duplicated signal on an identical retry.
- [ ] Navigation preserves a pending scenario request; a new run has a new incident ID.
- [ ] Household reports agree between Alexa simulation and Household; another incident/identity cannot inherit them.
- [ ] Full pagination, expired authentication and failed reads/writes are visible and recoverable.
- [ ] Saved failure flag is consumed by a recorded eligible virtual action; no fake recovery/success is shown.
- [ ] Water-only pending confirmation succeeds or fails truthfully; smoke/CO exclusion remains enforced.
- [ ] Handoff shows actual evidence, uncertainty, saved action outcomes and partial-page warnings; copy/print retain safety wording.
- [ ] Mobile/desktop, keyboard navigation, clipboard fallback and print layout visually reviewed.
- [ ] Hosted narrative rehearsed repeatedly in 2:45–2:55; record measured timing and actual evidence links.

These boxes remain unchecked until observed. Phase 7 source hardening and submission preparation are now documented in [Phase 7](phase-7.md). Runtime verification across prior phases is still outstanding work, not an extra completed phase.
