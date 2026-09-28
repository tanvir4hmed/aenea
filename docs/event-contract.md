# Event/state and authentication foundation

Implemented envelope version 1.1; the embedded **IncidentBridge 1.0** event and pinned dependency are unchanged. Existing incident selection is still required. Automatic assignment, state aggregation/severity, resolution and scheduled simulation belong to subsequent implementation, not this contract release.

## Ingestion contract

`POST /events` accepts `incident_id`, `event`, optional `adapter`/`incident_name`, and the new `contract_version` and `state` fields. Unknown fields are rejected. Authentication supplies household ownership; a client cannot supply trusted context.

```json
{
  "incident_id": "550e8400-e29b-41d4-a716-446655440000",
  "contract_version": "1.1",
  "adapter": "sensor",
  "state": { "alarm": "active", "connectivity": "online" },
  "event": {
    "schema_version": "1.0",
    "event_id": "unique-event-id",
    "household_id": "authenticated-subject",
    "occurred_at": "2026-09-28T10:00:00Z",
    "source": { "source_id": "registered-device-id", "category": "sensor", "simulated": true },
    "kind": "smoke",
    "observation": "Synthetic smoke alarm active"
  }
}
```

- `alarm`: `active`, `clear`, `unknown`. `connectivity`: `online`, `offline`, `unknown`. Both are mandatory in 1.1. Connectivity is not proof of hazard clearance; clear is not incident resolution.
- A new receipt requires an enabled device from the authenticated household catalog, a current location, matching source category and a supported signal type. Only simulation connections are admitted. Invented IDs, other-owner IDs, incompatible signals and claimed real sources fail before evidence publication.
- Server-generated `event_context` contains trusted device/location snapshots, catalog revision, `received_at`, source provenance and the validated state. Observation text stays untrusted; its room/location descriptions never override the catalog.
- `occurred_at` is the validated producer timestamp. `received_at` is the first accepted server timestamp. Keep both; neither arrival order nor repeated delivery proves newer hazard state. Ordering/active-state materialization is not implemented here.
- The raw S3 evidence remains the compatible IncidentBridge event. The receipt and timeline additionally retain the envelope context. No new bucket/table or destructive data migration is required.

## Retry and migration rules

Same event identity with changed event content, incident assignment or 1.1 state returns conflict. An intentional later report/clear/re-alarm needs a fresh event ID. A pending retry uses its first saved context even if the catalog is edited or the device removed afterward. Conditional receipt creation chooses one context for concurrent attempts. Publication remains at least once; the existing correlation transaction deduplicates timeline evidence and counts.

Unversioned/1.0 callers keep their existing digest and request shape. New submissions still require a registered device. State is `unknown`, not inferred from prose. Previously accepted pending legacy receipts can finish without new catalog validation; they are labelled `legacy_unverified`. Already published receipts remain duplicate-safe.

Old timeline records load through a non-writing compatibility projection with unknown state/provenance and no invented location. Historical records are not rewritten. Old arbitrary sample-source scripts must register devices and use those IDs for new submissions. The unused legacy sample component is not a bypass. Keep the current saved-device Studio/Command Center flow.

## MCP and sign-in

Cognito authorization now requests the exact API `/mcp` resource alongside PKCE. Runtime JWT verification requires signature, issuer, expiry, access-token type, client ID, resource audience and tool scopes. AgentCore also restricts the audience. Read-only tokens cannot perform writes. API Gateway already permits this audience alongside the client ID for legacy REST callers.

Sessions from the older unbound login need **one fresh sign-in**. Saved cloud incidents/settings remain intact. Refresh retains the resource binding; transient token-service outages keep the refresh session rather than logging the user out. A refresh completing after logout cannot restore that session.

Browser calls share one initialization, negotiate 2025-11-25, accept JSON or bounded finite SSE responses, ignore empty priming events and match JSON-RPC response IDs. A 404 for a session creates a fresh session; only explicitly read-only tools replay automatically. Uncertain writes are never auto-replayed. Report retries retain their request identity. Tool errors remain errors rather than being presented as successful outputs.

The proxy validates Origin, media/protocol headers, single-message JSON-RPC and size bounds; propagates session/status and supplies resource metadata on proxy/upstream authentication failures. GET remains 405: no persistent/resumable SSE feed is offered. This is the stateless JSON-oriented transport, not a claim of every optional MCP capability. API Gateway may reject invalid JWTs before the proxy; end-to-end hosted OAuth discovery and runtime access still require separate verification.

## Rollout and verification

Push deployment packages all shared-function consumers and the MCP helpers, applies MCP audience configuration, then publishes the frontend. No new credentials or manual data import are required. A cached old frontend should be reloaded and signed in again after rollout. Do not remove audience validation to work around cached/unbound tokens.

Offline tests cover ownership/category/capability denial, state/digest conflicts, pending/publication retries, concurrent receipt context, legacy read compatibility, signed JWT rejection boundaries, proxy failures, actual FastMCP initialization/tool calls, browser session recovery and refresh behavior. These checks do not establish cloud deployment success or native device/Alexa interoperability.

28 September source verification: 97 Python tests and 32 JavaScript tests passed, along with lint, selected formatting/strict typing, frontend build and MCP Terraform formatting. The SDK test client reports a Starlette/httpx deprecation warning; hosted authentication remains unverified.

Provider references: [Cognito resource binding](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html), [refresh binding](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html), [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
