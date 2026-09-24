# Workspace improvement phases

This sequence improves the contest application while keeping Alexa+ incident coordination central. Each phase requires owner permission before implementation. Finish with a commit and push, confirm the deployment trigger, and leave hosted acceptance for the dedicated verification session.

| Phase | Scope | Source status |
| --- | --- | --- |
| 1 | Cognito refresh, MCP authentication and explicit signal controls | Implemented |
| 2 | Application shell, dashboard hierarchy, responsive navigation and accessibility foundation | Implemented |
| 3 | Named locations and simulated device management | Implemented |
| 4 | Simulation Studio with selected devices and signal sequences | Implemented |
| 5 | Continuous incident updates and assessment revisions | Implemented |
| 6 | Decision verification and evidence review | Implemented |
| 7 | Alexa+ coordination experience | Implemented |
| 8 | Cleanup and data controls | Implemented |
| 9 | Contest release preparation | Implemented; release acceptance pending |

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

## Phases 5 and 6 implementation

Each newly correlated signal increments the incident evidence revision and returns the aggregate to `collecting_evidence`. Assessment records retain their revision, full bounded input snapshot and schema/citation verification results. The reasoner reads the revision before and after fetching evidence to detect a mixed snapshot. Publication requires that the evidence revision is still current and newer than the published revision. Out-of-order completions remain historical records rather than replacing a newer assessment. Duplicate publication cannot reset a review.

Policy refuses unpublished, outdated or rejected assessments. Previously unexecuted proposals may be reconsidered on a newer revision; completed virtual commands are not repeated. The executor rechecks the published assessment and evidence revision, then condition-checks both and the human-review gate in the same transaction as its state/audit write. A stale proposal is reported as superseded without executing it. Historical stored action records remain unchanged until legitimately replaced; superseded is a read/execution eligibility result, not a fabricated historical outcome.

The timeline response includes the current aggregate and directly fetched published assessment, independent of pagination order. Browser refresh continues after loading additional history and does not select the latest assessment by completion time. The UI labels previous assessments; Alexa simulator replies and handoff snapshots also carry freshness/review information.

Decision review shows the exact evidence snapshot, summary citations, action rationale/citations, model uncertainties, revision comparisons, policy reasons and saved human reviews. Schema/citation checks verify structural consistency, not factual correctness. `POST /incidents/{incident_id}/assessments/{assessment_id}/review` requires write scope, writes an audit and current-review gate atomically, and uses an idempotent request ID. Rejecting stops future execution from that assessment; agreeing does not confirm a valve action or bypass policy. Already completed actions cannot be undone. A review is attributable to the authenticated account; the shared guest identity cannot distinguish individual visitors.

The current reasoner limit remains 20 signals per incident. Inputs over that limit now fail explicitly instead of silently dropping older evidence. Evidence is retained; a large incident is not claimed to be fully assessed. Revising that budget/model strategy is separate work. Legacy assessments without revision metadata are historical and cannot authorize new execution. A fresh signal starts the new revision flow; no historical data is deleted or automatically reprocessed.

Offline validation: frontend build, 35 Python regression tests (including stale execution, concurrent publication, review replay and transaction guards), Terraform formatting and whitespace checks passed. Hosted concurrency/UI acceptance is deferred. The selective pipeline updates web, affected app infrastructure and Lambda code; neither AgentCore runtime source changed.

## Phase 7 implementation

The Alexa+ browser simulator has an incident context summary, explicit command suggestions and aliases, a bounded 30-turn local conversation, incident-scoped check-in form and action cards. Refresh context/actions reads through MCP; timeline and check-in pagination have separate controls. Replies distinguish stale/rejected assessments, self-reports, incomplete handoffs and actual saved action outcomes. Clearing chat does not delete server records. Microphone input fills the command field for review, never submits automatically; playback can be stopped by disabling read-aloud. Late responses after navigation or incident changes cannot populate a different conversation.

Valve confirmation now requires the assessment ID that the user reviewed, across HTTP and MCP. The executor compares it with the stored proposal before doing anything, and retains the existing transaction guards. A changed proposal needs fresh explicit approval; an old approval cannot move to the newer assessment. Old browser tabs must refresh to use the updated request contract.

Native Alexa registration and physical integration remain unverified; this phase improves the browser experience over the real MCP/backend path. No native connection or free-form natural-language reasoning is claimed. Deployment includes web, Lambda consumers and the MCP runtime tool-schema update. No Terraform changes are needed.

Verification: production frontend build, 36 Python regressions, six JavaScript checks, Python compilation and whitespace checks passed. Hosted and browser acceptance remain deferred.

## Phase 8 implementation

Settings → Data controls accepts an explicit full-incident-ID confirmation and shows per-incident cleanup status. `POST /incidents/{incident_id}/delete` atomically creates a tenant-bound deletion marker and background job and marks an existing owned summary as deleting. Duplicate requests return the existing marker without resetting the drain window. `GET /household/deletions` is a paginated read-scoped status endpoint. No bulk account or infrastructure destroy is performed.

Ingress, correlation, reasoner, policy, action execution, review and MCP entry points reject deleted targets. Correlation condition-checks the marker transactionally; execution/review transactions check the summary deletion field. The worker starts at least 900 seconds after the request, exceeding the maximum application Lambda lifetime of 170 seconds and workflow timeout of 420 seconds. This lets writes already in progress drain. Later workflow stages and delayed event replays recheck the marker. The marker is deliberately retained indefinitely so old retries cannot recreate an incident.

The single-concurrency `aenea-cleanup` Lambda runs every five minutes, queries the dedicated cleanup-job partition and only processes marked targets. It removes all evidence object versions and delete markers under the exact owner/incident S3 prefix, the incident partition, associated ingress receipts, incident summary and virtual output states still owned by that incident. Unrelated incident receipts, newer output states, catalog and permissions are retained. Failed work remains queued and is retried by the next scheduled invocation; no partial failure is reported as completion. Progress cursors prevent large household receipt lists from restarting at the first page each time.

This is active-store deletion, not a promise to erase PITR backups, Step Functions history, diagnostic logs or copied/exported files. Those follow separate service retention policies. Local simulation drafts may be cleared separately and are reset when deleting a referenced incident. No real incident data was deleted during implementation.

The existing deployment-policy template now includes the exact default-bus rule ARN `rule/aenea-cleanup`. Existing accounts whose live GitHub role only allows custom-bus rule ARNs must reconcile bootstrap before deploying this rule (see operations). This phase adds no GitHub secret. The pipeline targets web, app infrastructure and shared Lambda consumers; deployment-script edits accompanied by concrete component changes no longer force unrelated AgentCore rebuilds.

Offline checks: frontend production build, 44 Python regression tests, Terraform formatting and whitespace checks passed. Scheduled cleanup, live IAM and hosted deletion acceptance remain unverified.

## Phase 9 implementation

Updated the README, submission draft, judge guide, timed demo narrative, build evidence and release gates against the current source and official contest requirements. Retained the owner-selected architecture image unchanged. Corrected stale resource-bound-token, old phase status and private-only guest-access statements.

Primary scope remains the Alexa+ alternate simulation, with AWS Builder integration documentation and optional separate IncidentBridge Open Source evidence. Public repositories and the contribution's Apache-2.0 license/date were checked. No new mini-project, native integration or SaaS scope was added.

This phase is documentation-only: no IAM reconciliation, cloud resource mutation, hosted test, video upload or Devpost submission. Remaining release gates are explicitly tracked in release-checklist.md. Documentation checks and push are the completion boundary; docs-only paths do not trigger the application deploy workflow.
