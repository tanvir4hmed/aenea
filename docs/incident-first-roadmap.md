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

### Phase 0 — recoverability and trustworthy states

Fix this before any new dashboard work.

- Replace generic “Request failed” messages with an operation-specific error: affected incident, whether a write may have completed, safe retry action and support-safe diagnostic ID.
- Add consistent loading, empty, timeout and retry states to every incident-dependent page. Never render raw configuration or authentication races.
- Give every incident a visible lifecycle: `collecting evidence`, `assessing`, `needs confirmation`, `coordinating`, `resolved`, `failed`, `archived`, and `deletion pending`.
- Make failed or old incidents recoverable: show the failed step/reason, refresh safely, reassess retained evidence where valid, archive/hide, or request guarded deletion. Do not silently strand an incident in `collecting evidence`.
- Redesign deletion around the incident itself: an incident menu, clearly separate **Archive** from irreversible **Delete**, copyable ID, deliberate confirmation, progress state and immediate visible result. Keep the existing scheduled cleanup path; do not bulk-delete shared data.
- Add pagination/filtering for incident history so old records remain manageable.

**Acceptance gate:** a fresh synthetic incident can be created, assessed, updated, archived and deletion-requested without a vague error; an intentionally failed fixture explains how it can be recovered.

### Phase 1 — information architecture and pre-incident setup

Move setup away from active-incident operations.

- Navigation: **Command Center**, **Incident history**, **Settings**, **Guide**. Alexa coordination becomes a Command Center panel, not a disconnected workflow users need to find.
- Settings sections: Locations, Device inventory, Response policy and Data controls.
- Locations are user-named and may represent a home, office, building, unit or other site; each has optional address and rooms/zones.
- Replace the long device list with a searchable/filterable inventory grouped by location and room. Use a details drawer or dedicated detail page for edit, disable, duplicate and delete.
- Device records gain validated display metadata needed by the map: location, room/zone, device type, enabled state and a simple layout position/template. Keep simulated source explicit.
- Keep response permissions separate from a device's basic inventory information.
- Treat capacity as a usability boundary, not a one-device-per-room model. The prototype supports up to **50 locations per household**, **40 rooms/zones per location**, **200 devices per location** and **30 devices per room/zone**. This comfortably permits several smoke detectors, cameras and other sensors in one home or office. Validation prevents a room from becoming unreadable; the inventory remains the source of truth.
- The floor view shows individual devices up to 12 per room. Above that, it groups normal devices by type and expands them on selection; affected and reporting devices always remain individually visible.

**Acceptance gate:** a user can set up two named locations, including a room with several same-type sensors, manage devices without scrolling through an add form, and find data controls without passing through device inventory.

### Phase 2 — focused incident Command Center

Build the graphical dashboard only after Phases 0–1 are accepted.

- Show one selected active incident with severity, current lifecycle state, latest evidence, affected location, people/check-in summary, assessment revision, policy outcome and next required human step.
- Render an accessible, semantic device map/floor-plan from location and device metadata. It must also work as a keyboard-operable list; colour or icons cannot be the sole status signal.
- A location or room click focuses that zone and opens its device tray. A device click opens a compact detail panel, rather than immediately generating an event.
- In **Simulation mode** only, the device detail panel offers only signal types that device can produce—for example, a smoke detector can create smoke/CO and a leak sensor can create water-leak evidence. The user then chooses **Start new incident** or **Add to selected incident**. Both commands send the existing simulated-ingest event; they never create display-only data.
- A room-level **Build test scenario** action can stage several selected device signals, then send them together or release the next signal later. This retains the existing Simulation Studio capability while making it accessible from the floor view.
- Once an event is accepted, the map immediately marks it `reporting`; the incident timeline, assessment and Alexa+ panel update as the real pipeline completes. The UI shows processing instead of pretending an agent decision already exists.
- The map displays only useful incident states: normal, reporting, affected, unavailable and action-pending. It must not imply a live physical-device connection.
- Keep the timeline compact and progressive: new evidence and decision revisions appear as concise updates, with full audit detail available on demand.

**Acceptance gate:** click Kitchen, select a named smoke detector, create a smoke signal, then create a later camera or leak signal for the same incident. Both map/timeline/Alexa updates must result from the actual event path without changing pages. A staged multi-device scenario must use the same path.

### Phase 3 — Alexa+ coordination surface

Make Alexa's role clear and useful without claiming a native integration.

- Add an in-app **Alexa+ coordination** panel beside the active incident: concise proactive briefing, what changed, immediate safe recommendation, open question and the next action.
- Persist incident notification records so a refresh/reload does not lose material updates. For the prototype, client refresh/polling is sufficient; do not add WebSockets unless a later need proves it.
- Surface new-evidence updates, escalation/de-escalation, policy-blocked actions, check-in changes and handoff readiness. Avoid noisy duplicate alerts.
- Keep typed commands as a secondary demonstration method. Provide supported prompts and a user-initiated “Read briefing aloud” control; do not auto-play browser audio.
- State the boundary in product language: this is an Alexa+ simulation; no native Alexa messaging, real alarm action or emergency dispatch occurs.

**Acceptance gate:** after a new signal is processed, the selected incident displays a fresh briefing and any changed decision without the user opening Household, Handoff or a separate Alexa page.

### Phase 4 — accountable decision and household coordination

- Add a single **Needs your decision** queue for confirmation-required actions.
- For each decision, show evidence and assessment revision, policy reason, allowed choices, expiry/staleness state and what approving/rejecting will do.
- Bind approval to the current assessment revision; an incoming signal invalidates stale approval and produces a new briefing rather than executing an old decision.
- Keep household self-reports incident-specific and synthetic. Make them available as an Alexa-requested task with web fallback.
- Make handoff asynchronous but legible: preparing, ready, retryable failure and last-updated revision. A handoff remains a bounded synthetic brief, never a responder dispatch.

**Acceptance gate:** a new signal after a proposed action creates a new revision and blocks stale approval; the user can understand why without reading raw agent output.

### Phase 5 — accessibility, resilience and demo readiness

- Responsive layouts for laptop, tablet and narrow mobile views; keyboard navigation, visible focus, labelled controls, logical heading order and screen-reader status announcements.
- Prevent duplicate submissions, distinguish “saved” from “processing”, preserve selected incident on refresh, and offer a safe retry path for transient failures.
- Provide a resettable, isolated demo household/seed scenario. Do not delete shared guest data as a reset mechanism.
- Add end-to-end UI coverage for authentication return, configuration loading, device CRUD, map-triggered signal, single/multi-signal correlation, new-evidence reassessment, check-in, decision review, handoff, archive and guarded deletion.
- Run an explicit hosted verification checklist with a clean demo account and document all remaining simulation limits.

**Acceptance gate:** a judge can complete the main story in one browser session with no unexplained failure, no manual UUID hunt and no required page hopping during the incident flow.

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

Start with **Phase 0 only**. First inventory existing incident APIs, lifecycle fields, UI error paths and cleanup state; write tests for the old failed-incident and guarded-deletion journeys before altering the interface. Do not begin the map or Alexa panel until the Phase 0 acceptance gate is met.
