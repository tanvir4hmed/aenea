# Incident-first remediation and Command Center roadmap

**Status:** approved implementation plan — no Command Center feature work has started.
**Last reviewed:** 2026-09-24

## Product boundary

Aenea is an Alexa+-centered, simulated household incident-coordination prototype. It is not a certified alarm, native Alexa/Ring integration, physical-device controller, emergency-dispatch service, or production multi-tenant SaaS.

The intended experience is deliberately incident-first:

1. Before an incident, a household configures locations, simulated devices and virtual-action permissions.
2. A device signal starts or adds evidence to an incident.
3. The incident pipeline correlates evidence, assesses it, applies deterministic policy and records a revisioned decision.
4. The Alexa+ simulation proactively presents the relevant briefing, asks for only necessary human confirmation, and reports material changes.
5. The web workspace is the setup, command, review and audit fallback—not something a person must continuously operate during an emergency.

All people, signals, outcomes and actions remain synthetic. A household check-in is never proof of a person's current safety.

## What is already corrected

The following backend regressions were fixed and deployed before this plan:

- DynamoDB timeline queries no longer issue an invalid empty `begins_with` condition.
- Cleanup no longer reserves Lambda concurrency that the account cannot provide; a DynamoDB lease serializes sweeps instead.
- The workflow tolerates an older correlation result that omits `deleted`.

These fixes need to remain in the regression suite, but are not a reason to redesign the product.

## Delivery order

There are exactly two implementation phases. **Phase 2 may not start until Phase 1 passes its hosted acceptance gate and the user gives explicit permission.**

### Phase 1 — Incident Experience Hardening

This one phase completes every previously identified reliability, usability and coordination issue before a graphical Command Center exists.

#### 1. Reliable incident lifecycle

- Replace generic “Request failed” messages with an operation-specific error: affected incident, whether a write may have completed, safe retry action and support-safe diagnostic ID.
- Add consistent loading, empty, timeout and retry states to every incident-dependent page. Never render raw configuration or authentication races.
- Give every incident a visible lifecycle: `collecting evidence`, `assessing`, `needs confirmation`, `coordinating`, `resolved`, `failed`, `archived`, and `deletion pending`.
- Make failed or old incidents recoverable: show failed step/reason, refresh safely, reassess retained evidence where valid, archive/hide, or request guarded deletion. Do not strand an incident in `collecting evidence`.
- Add paginated, filterable incident history.

#### 2. Clear settings and data control

- Rework navigation to **Incident workspace**, **Incident history**, **Settings** and **Guide**; existing pages become focused views inside the workspace rather than a page-hopping requirement.
- Split Settings into Locations, Device inventory, Response policy and Data controls.
- Support user-named locations such as home, office, building or unit, with optional address and rooms/zones.
- Replace the long device list with searchable/filterable inventory grouped by location and room. Use a details drawer or dedicated detail page for edit, disable, duplicate and delete.
- Keep response permissions separate from device inventory.
- Redesign deletion at the incident level: clearly separate **Archive** from irreversible **Delete**, provide a copyable ID and deliberate confirmation, show cleanup progress and update history immediately. Never use global/shared-data deletion as a reset.

#### 3. Alexa-led incident coordination

- Put an **Alexa+ coordination** panel in the incident workspace: current briefing, what changed, recommendation, open question and next action. Fix the existing spacing/alignment issue between incident selection and command controls.
- Persist concise incident update records so refresh/reload does not lose material changes. Client refresh/polling is sufficient for this prototype.
- Surface new evidence, escalation/de-escalation, policy-blocked actions, check-in changes and handoff readiness without noisy duplicates.
- Keep typed commands as a secondary demo path, with supported prompts and a user-initiated read-aloud action. State honestly that it is an Alexa+ simulation, not native Alexa messaging or emergency dispatch.

#### 4. Decision, household and handoff flow

- Add one **Needs your decision** queue for confirmation-required actions, showing evidence/revision, policy rationale, choices, expiry/staleness and consequence.
- Bind approval to the current assessment revision. Later evidence invalidates stale approval and produces a new briefing.
- Keep synthetic, incident-specific household reports available from Alexa-requested tasks with a web fallback.
- Make handoff states legible: preparing, ready, retryable failure and last-updated revision.

#### 5. Quality and proof

- Make layouts responsive and accessible: keyboard navigation, visible focus, labels, headings and screen-reader status announcements.
- Prevent duplicate submits, distinguish saved from processing, preserve selected incident on refresh and offer safe transient-error retries.
- Provide a resettable, isolated demo household/seed scenario instead of mixing shared guest records.
- Add end-to-end coverage for login return, configuration loading, device CRUD, single/multi-signal correlation, reassessment after new evidence, check-in, decisions, handoff, archive and guarded deletion.

**Phase 1 acceptance gate:** a clean demo user can configure devices, run one single and one multi-signal simulation, receive understandable Alexa-led updates, handle a decision, prepare a handoff, and recover/archive/delete an old incident in one browser session—with no unexplained error, UUID hunt or required page hopping.

### Phase 2 — Interactive graphical Command Center

Start only after Phase 1 is accepted and permission is granted.

- Add location/room/layout metadata, supported signal types and capacity validation to simulated-device records.
- Support up to **50 locations per household**, **40 rooms/zones per location**, **200 devices per location** and **30 devices per room/zone**. This supports several smoke detectors, cameras and other sensors at one site.
- Render an accessible, semantic device map/floor-plan; it also has an equivalent keyboard-operable list. Individual devices show up to 12 per room; above that, normal devices group by type while reporting/affected devices remain visible.
- Click location/room → focus zone and open device tray. Click device → detail panel. In Simulation mode, choose only a signal that device supports, then **Start new incident** or **Add to selected incident**.
- Add a room-level **Build test scenario** option to stage selected signals and send them together or later. It reuses the existing ingestion contract with a `command_center` source marker—never a parallel mock-event store.
- After event acceptance, show `reporting`; then let the actual pipeline update timeline, decision state and the Alexa+ panel.

**Phase 2 acceptance gate:** click Kitchen, select a named smoke detector and generate a smoke signal; later add camera or leak evidence to the same incident. The real pipeline updates map, timeline and Alexa briefing without page changes. A staged multi-device scenario follows the same path.

## Required data and API additions

No physical devices, Ring simulator, WebSocket service or new AWS product is required for the first implementation.

| Need | Minimal change |
| --- | --- |
| Device map | Add location/room/layout metadata, supported signal types and capacity validation to existing simulated-device records; validate it in device APIs. |
| Map-triggered simulation | Reuse the existing ingest/event contract with a source marker such as `command_center`; add no parallel mock-event store. |
| Incident lifecycle | Store a typed incident status, processing detail, transition time and recoverable failure reason. |
| Proactive Alexa panel | Persist concise incident notification/update records and expose them through the existing authenticated API/MCP boundary. |
| Decision queue | Query pending actions by incident/current assessment revision; expose expiry and policy rationale. |
| History and deletion | Paginated incident list plus archive/deletion-request status and idempotent guarded commands. |
| Demo isolation | Seed/reset commands scoped to a designated demo household, never global shared data. |

Existing Terraform, DynamoDB, Lambda/API, Step Functions, AgentCore reasoner, Cognito and CloudFront infrastructure should be extended only when a phase proves the need. Every new resource must use the existing Aenea naming/tagging convention and be included in least-privilege IAM and cleanup documentation.

## Explicit non-goals for this build

- Native Alexa+, Ring, Fire TV or physical IoT device connection.
- Automated emergency calling, professional monitoring or a claim that the system verifies a person's safety.
- A full commercial multi-tenant SaaS administration, billing or mobile-app program.
- A decorative map disconnected from the actual simulation and incident pipeline.

## Release checks after every phase

1. Run focused backend and frontend tests, then the full relevant suites.
2. Build the web app and inspect the changed browser flow with an authenticated clean account.
3. Commit a small, scoped change and push it; GitHub Actions selects only affected deployment components.
4. Record the hosted result or an actionable failure in the release evidence. Do not mark a phase complete solely because a deployment was triggered.

## Build sequence for the next implementation session

Start and complete **Phase 1 only**. First inventory existing incident APIs, lifecycle fields, UI error paths and cleanup state; write tests for the old failed-incident and guarded-deletion journeys before altering the interface. Do not begin any graphical map/floor-plan work until Phase 1 is hosted-verified and explicit permission for Phase 2 is given.
