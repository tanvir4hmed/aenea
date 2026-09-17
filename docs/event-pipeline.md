# Event pipeline — Phase 3 implementation

Authenticated simulation -> ingress Lambda -> IncidentBridge validation -> S3 evidence -> EventBridge -> Step Functions Standard -> correlate Lambda -> DynamoDB incident aggregate and timeline -> authenticated UI reads.

POST /events accepts incident_id (UUID), adapter, and a canonical IncidentBridge event. The event household_id must equal the verified Cognito subject. The browser obtains that value from GET /incidents, not from an unverified token decode. Only simulated events are accepted in this phase.

Incident grouping is explicit: the simulator creates an incident UUID or adds evidence to a selected incident. Automatic temporal/cross-signal incident correlation is not claimed. Source event IDs are stable across retries.

Ingress reserves a household/source/event identity with a payload digest and incident ID. Conflicting reuse returns 409; a pending publish is retryable. EventBridge accepts at-least-once delivery. Correlate writes the timeline item and increments its incident count in one DynamoDB transaction; duplicate delivery cannot increment it twice.

A 202 response means the event was published, not that processing has finished. The UI labels that distinction and polls the selected timeline. Records persist with status collecting_evidence. AI assessment, policy decisions and actions are Phase 4.

GET /incidents returns the authenticated household's incident summaries. GET /incidents/{incident_id}/timeline reads only that household's timeline. Both use bounded pages and household-bound continuation keys. Results are key-ordered; summaries are not advertised as sorted by recency. Timeline timestamps are observation times, which are not independently verified. created_at on an incident is the timestamp of its first processed observation.

Raw evidence is private and not exposed through the browser API. The library validates event shape; authentication, tenancy and execution controls live in Aenea.

Implementation has not been deployed or end-to-end verified by the assistant. Deferred checks include duplicate/conflict retry behavior, source IAM permissions, unauthenticated/wrong-household requests, pagination, PKCE login, and browser-to-timeline flow.
