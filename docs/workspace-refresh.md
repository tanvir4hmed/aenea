# Workspace improvement phases

This sequence improves the contest application while keeping Alexa+ incident coordination central. Each phase requires owner permission before implementation. Finish with a commit and push, confirm the deployment trigger, and leave hosted acceptance for the dedicated verification session.

| Phase | Scope | Source status |
| --- | --- | --- |
| 1 | Cognito refresh, MCP authentication and explicit signal controls | Implemented |
| 2 | Application shell, dashboard hierarchy, responsive navigation and accessibility foundation | Implemented |
| 3 | Named locations and simulated device management | Implemented |
| 4 | Simulation Studio with selected devices and signal sequences | Implemented |
| 5 | Continuous incident updates and assessment revisions | Awaiting permission |
| 6 | Decision verification and evidence review | Awaiting permission |
| 7 | Alexa+ coordination experience | Awaiting permission |
| 8 | Cleanup and data controls | Awaiting permission |
| 9 | Contest release preparation | Awaiting permission |

## Phase 2 implementation

- Shared shell with consistent line icons, route titles, concise page descriptions and incident context.
- Native navigation links preserve open-in-new-tab behavior; keyboard navigation includes a skip link, current-page state, route-heading focus and mobile menu Escape handling.
- Responsive sidebar/menu, fluid panels and 44-pixel minimum button/input height. Print styles preserve handoff output.
- Dashboard counts loaded incidents and pending confirmations in the loaded timeline; it does not imply that paginated results represent the entire dataset.
- Quick actions open simulation, Alexa+ and handoff. Empty/loading states clarify the next step.
- Public `/guide` page explains existing workflows and simulation limits. No new physical integration is advertised.
- Existing backend routes, authorization and simulation contracts are reused. No new dependencies or infrastructure resources are introduced.

Verification: frontend production build and whitespace checks passed. Browser visual, screen-reader and hosted interaction acceptance remain pending; this is not a claim of WCAG certification. Frontend-only source paths select the web deployment; backend and agent packages do not require rebuilding for this phase.

## Phases 3 and 4 implementation

Settings supports arbitrary location names and optional addresses, device names/rooms, six input-device types, duplicate/edit/delete and enable/disable. Multiple cameras or detectors at one or several locations are supported. Simulation is the only enabled connection; unavailable future integration choices do not accept credentials or claim connectivity.

`GET /household/catalog` and `PUT /household/catalog` use the existing authenticated action-executor integration with read/write scopes. The catalog is a separate `CATALOG` record under the verified identity partition. Writes require the last saved revision to avoid silently overwriting another visitor's edits. Validation bounds the catalog to 30 locations / 100 devices and rejects orphan devices, duplicate IDs and non-simulation connections. Removing entries removes them from the current DynamoDB catalog. Historical incident evidence and infrastructure backups are not purged by catalog deletion; incident cleanup remains Phase 8. Existing virtual action permissions remain in `PROFILE` and now have their own Settings section.

Simulation Studio composes up to 50 device-specific observations, allows selecting a subset, ordering drafts, sending all selected or just the next, and pausing after the current request. New signals in a run stay in its selected incident. Replay assigns fresh event/run identities; clear removes local drafts only. Per-signal receipts distinguish accepted inputs from agent outcomes. Built-in walkthroughs remain separately available with clearly identified sample sources.

Signals retain a stable device UUID in `source_id` and a snapshot of location/room/device labels in observation text. The existing IncidentBridge schema is unchanged; labels are synthetic context, not verified physical location. A multi-signal send is sequential, not transactional or guaranteed simultaneous. Future signals can be sent manually later; there is no background scheduling guarantee after closing the tab. Drafts and exact pending payloads persist in identity-keyed session storage; uncertain retries reuse their event identity. Removing a device prevents composing a fresh signal from it, while a previously submitted uncertain payload remains retryable.

Checks: frontend build, 25 Python regression tests, three Node signal-contract checks, Terraform formatting and whitespace checks passed. Hosted deployment and browser acceptance remain deferred. Deployment includes web plus the app API routes/function packages; it does not require changing either AgentCore runtime or the database infrastructure.
