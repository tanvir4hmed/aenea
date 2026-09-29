# Automatic incident processing

Source implementation, 29 September 2026. Offline checks are not hosted acceptance. The browser still injects simulated signals; no native Alexa, Ring or physical-device connectivity is claimed.

## Assignment and human resolution

Command Center defaults to **Automatic** assignment. Studio still saves definitions only. `/events` may omit `incident_id`; ingress validates the registered device/location, reserves an assignment, then publishes to the same evidence/assessment/policy pipeline. The returned incident ID is authoritative. Multi-property or unrelated-hazard selections can produce multiple incidents rather than a single scenario-shaped incident.

Routing is constrained by household, registered location and hazard family. Smoke/CO share a route; motion/doorbell/package/vehicle share a non-emergency camera-context route. Water leak, medical SOS and severe weather each have separate routes. Compatible activity continues joining the open route, even hours later. This does not establish that alerts have the same physical cause; correlation is deliberately conservative and does not perform free-form model merges.

The AgentCore/Strands agent proposes a structured create/name decision or a join decision against the permitted open candidate. A new device/signal receives a routing explanation; subsequent reports reuse the established assignment without another routing-model invocation. The routing cache is bounded, not the number of accepted events. Server constraints prevent the model from selecting another property/family or reopening resolved work. Model timeout/invalid output uses an explicitly labelled location/hazard fallback; incident assessment still requires a real successful agent response. A fallback title does not imply a model decision.

Receipt, route ownership and new incident commit atomically. Concurrent first reports converge on one route. Retry identity retains the original incident even after resolution. Routing explanations are saved with each event; manual title changes are audited. Existing selected-incident callers remain compatible; new additions cannot target resolved activity or a conflicting known property/hazard. Legacy records are not retroactively assigned an invented location.

**Resolve incident** requires explicit human confirmation and the displayed evidence revision. New evidence racing with resolution produces a conflict rather than closing unseen evidence. Resolution closes assignment and blocks pending/stale actions; it does not certify safety, clear a sensor or erase history. A fresh post-resolution event can create new activity. Previously accepted late deliveries are archived without reopening actions. Newly submitted pre-resolution timestamps are rejected visibly, not silently routed into new activity. This simulator behavior requires a separate late-data policy when a real adapter is introduced.

Deletion also closes the route. Cleanup removes incident content and receipt context but retains minimal hashed event-identity tombstones (`pk`, `sk`, `status`) to prevent old retries from resurrecting deleted activity. These contain no event content, device/location snapshot or incident name. Existing pre-upgrade receipt deletions cannot be reconstructed.

## Long incidents and current state

There is no 20-event incident lifetime cutoff. History is paginated and the latest state is derived across all event pages, by device/signal and producer timestamp (event ID breaks equal-time ties). Out-of-order reports remain evidence without overriding newer states. Clear removes that signal from active state; offline/unknown is not clearance. Repeated copies from one detector do not become independent corroboration.

Each model call receives at most 32 representative current events plus complete active-kind counts and total-history counts. It does not receive every historical observation. Evidence citations must reference the supplied events; sampled context is labelled partial. Policy reads every current uncleared signal, including signals outside model context. An old uncleared smoke/CO signal still blocks a conflicting valve action; freshness requirements for action citations remain enforced.

Unchanged repeats may reuse an unexpired assessment with citations remapped to the same device/signal; changed states/observations require assessment. Publication and action execution require the exact latest revision and an open incident. Every event starts the workflow; changed snapshots/model failure retry up to three assessment attempts per workflow, then remain visibly unavailable. **Retry assessment** starts recovery without inventing another sensor event. Infrastructure failures may still require operator recovery; bounded retries are not an availability guarantee.

Canonical backend severity feeds the map/briefing: an uncleared signal supplies a warning floor; two distinct smoke/CO sources, CO or medical SOS supply an urgent floor. A current, non-rejected assessment may raise severity and mark its cited devices red, never lower the floor. Cleared/resolved state is not replaced by historical UI evidence. These are prototype display rules, not certified hazard detection or medical diagnosis.

## Rollout, checks and remaining boundaries

Push selection updates shared Lambda consumers, the reasoner runtime, app routes/IAM, workflow and frontend. Added permissions are scoped to the existing table, runtime and event bus. No new AWS service, credentials, Terraform state migration, environment rename or destructive reset is required. Data structures are additive. Deploy the coordinated changes before relying on the new controls; a source push does not confirm rollout.

Offline results: **113 Python tests and 34 JavaScript tests pass**, plus correctness lint, five-module strict typing, selected formatting, frontend production build and Terraform formatting. Coverage includes DynamoDB transactions with Moto, concurrent first assignment, location/hazard separation, duplicate publication, revision-checked resolution, late delivery/deletion boundaries, 250-event paginated history, bounded context, repeat/clear/re-alarm ordering, stale-action refusal and model-failure recovery. The test SDK emits a Starlette/httpx deprecation warning. Browser/hosted acceptance remains outstanding.

Scheduled simulations, per-incident generation ceilings/counters, named selection conflicts and unified library capacity remain the next phase. Current scenario/transport batches still cap at 20 devices; this is not an incident total. Location-scoped actuators and proactive Alexa conversation remain later work. Existing virtual outputs are not physical devices. State derivation scans paginated history; large-history read cost and fully materialized aggregation need measured release-scale evaluation. Model context is bounded; evidence is preserved, not discarded.
