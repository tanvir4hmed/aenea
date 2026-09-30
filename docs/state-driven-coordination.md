# State-driven coordination

Source implementation: 30 September 2026. Simulation replaces physical inputs/effects, not the incident or agent pipeline. No native Alexa/Ring connection, people registry, emergency calling or monitoring service is claimed.

## Processing

Studio saves definitions only. Command Center expands selected saved singles/scenarios, names every duplicate-device source, and starts a durable run. The cloud worker invokes the same authenticated ingress processing used by manual simulated inputs. Stable event IDs survive transport uncertainty; published, correlated, assessed and executed are separate milestones.

Automatic incident assignment uses trusted location/hazard boundaries and constrained agent naming. Delayed related reports can join the open incident; different locations or unrelated hazards remain separate. Human Resolve checks current evidence **and note revisions**. Associated running/paused synthetic schedules stop on the next worker tick; an in-flight request can complete but cannot authorize an obsolete action. Stop alone never fabricates sensor clearance or resolves the incident.

Only simulator ingress is currently supported. Future authenticated physical adapters must bypass the simulator-generation allowance while retaining identity, ownership, ordering and policy checks. A future real hazard must never be dropped because this test allowance or model context is full.

## Capacity and schedules

| Boundary | Implemented limit |
| --- | --- |
| Catalog | 50 locations, 200 total input/output devices, 30 per room/location |
| Saved definitions | 250 definitions, 200 devices per scenario, 2,000 total signal references |
| Selected run | 1–200 distinct devices; no active/paused device overlap across runs |
| Transport/storage | 2.5 MB library request; 300 KB per definition/run; paged generation storage |
| Profile | On-change or active repeats; interval 60–900 s, duration 60–3,600 s, optional final clear |
| Default profile | One active/online report, 300 s duration, no automatic clear |
| Incident allowance | 2,000 simulator reservations; explicit extension up to 10,000 |
| Model input | At most 32 representative events, aggregate current-state counts; payload kept below 60 KB |

Repeat count is `ceil(duration / interval)`, plus a final clear if configured. On-change sends one initial state plus that optional clear. A 200-device, five-minute repeating run with final clear therefore expects 1,200 signals. These are test profile settings, **not manufacturer reporting guarantees**.

The EventBridge rule ticks once per minute. A serialized worker delivers at most 20 due rows per run per invocation, rotates device order and persists the global queue cursor. Processing time, cold starts and competing runs can delay delivery beyond the configured interval. Scheduled timestamps are retained; stale evidence cannot authorize new actions. This is a bounded test scheduler, not a hard-real-time safety system or proven large-building throughput guarantee. Late delivery/failure is visible and resumable; invalid or over-age events pause rather than silently disappear.

Counters reserve once per event before publication, so the incident's reserved count can exceed a run's published count during failure recovery. Limit exhaustion pauses new generation including any unissued clear, while accepted events continue processing. Extend the selected incident's allowance then resume, or stop. A new incident starts fresh; no carry-forward. The application displays the counter and warning separately from incident lifecycle.

## Actions and briefings

Register virtual lights, sirens, notifications and water valves in Settings at the intended location. Permissions default off. Policy expands an agent's supported capability proposal to matching registered outputs, never household-global output identifiers. At execution it rechecks the exact evidence/notes/assessment, catalog and permissions revisions, expiry and location. A device/action has one durable identity per incident; completed/failed executions are not automatically repeated.

Valve closure always needs explicit approval. All active smoke/CO evidence in **any open incident at the same location** vetoes it; a location evidence epoch guards concurrent new signals. Missing information or changed revisions cannot become authorization. These policies are prototype guards, not certified emergency procedures.

Material briefing changes persist with evidence references and audit records. Unchanged repeated state does not produce a new briefing identity. Alexa+ polls every ten seconds while open; optional browser speech deduplicates briefings and spaces ordinary announcements by 30 seconds, with urgent escalation exempt. Speech cannot continue in a closed browser. Connection age is visible. Microphone transcription is optional English browser functionality and leaves editable text before sending.

Status/timeline/acknowledgment commands use a bounded intent classifier or explicit MCP buttons. Free text cannot approve devices, change permissions, resolve incidents or call anyone. Optional notes are attributed, unverified reports, kept separately from device evidence; they invalidate stale proposals and request reassessment. Drafts stay in this browser tab; saved notes and briefings survive reload. No member entities are created.

## Migration, deletion and rollout

- Existing single-item libraries read through the compatibility projection. The next save writes paged generations behind a revision-checked pointer. Old generations and interrupted writes receive scheduled cleanup. Legacy pending browser batches retain their original retry identities.
- Duplicate old Single Alert definitions must be edited/removed before a library save; scenarios can reuse a device across definitions. Overlapping selection cannot send a device twice in the same run.
- Register new location outputs and explicitly enable their permissions. Old global virtual settings do not silently grant access to any new location. Existing output/action/history records remain readable.
- Household/Handoff navigation is retired. Their old URLs resolve to Incident history; historic reports remain readable. New person reporting is rejected and is no longer advertised by MCP. Legacy read-only tools remain for compatibility.
- Incident cleanup stops related runs and removes run data, generation counter, incident records, applicable output state and all evidence object versions after the drain window. Minimal replay/deletion markers remain. Deleting a multi-location run's associated incident stops the **whole run**; remaining incidents/evidence are retained, not silently removed. Backups/logs/workflow history follow separate retention.
- Before the first scheduler rollout, reconcile bootstrap IAM with an authorized administrator session: `python scripts/reconcile_bootstrap.py`. The new exact default-bus rule permission is `aenea-simulation`. A normal application push cannot grant the deployment role its own missing administrator permissions. No new GitHub secret is needed.
- Pushes select changed web, Lambda, Terraform and AgentCore components. New scheduler code, IAM, API routes and packaging are wired together. Bootstrap reconciliation is separate; no local apply or hosted verification is implied by this source release.

Known boundaries: shared guest identity; no production SLA; paged state derivation still scans history; model/transport retries are bounded and may require explicit reassessment; browser speech is not an Echo notification channel; runtime transitive dependencies and full IAM/penetration/performance audits remain operator release gates. See [verification](source-verification.md).
