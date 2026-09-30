# Alexa+ experience and MCP

Source implemented on 21 September 2026; resource-bound authentication and transport regressions updated on 28 September 2026. GitHub Actions owns packaging and deployment. Hosted acceptance is tracked separately: this document does not claim a working native Alexa connection. See the [event/auth migration guide](event-contract.md).

## Shared coordination path

The `/alexa-sim` browser view is an MCP client, not a separate mock backend:

Browser → API Gateway `POST /mcp` → fixed-upstream proxy → JWT-authenticated AgentCore MCP runtime → private household-tools Lambda → the same DynamoDB records and deterministic action executor as the command center.

The MCP server uses Python SDK 1.30.0, Streamable HTTP, protocol negotiation for `2025-11-25`, stateless HTTP and JSON responses. AgentCore session IDs are passed back to the browser and reused for runtime affinity; household state never depends on that session. `GET /mcp` returns 405 because no standalone SSE subscription is offered. Requests/responses are limited to 64 KB/200 KB, with a 20-second upstream timeout. Timed-out writes are not automatically retried: read their saved status first.

The browser now displays persisted live briefings, active devices and actual action outcomes, polling every ten seconds. Three explicit command buttons use MCP. Other short English commands pass through a bounded AgentCore intent classifier for status, timeline or acknowledgment; unsupported requests never become device approvals. Optional speech recognition fills editable text before submission; optional browser speech announces material briefings. Neither is native Alexa speech. Browser microphone processing may use its vendor service; use synthetic information only. Optional notes use an authenticated application API and are unverified context, not people records. See [behavior and rollout](state-driven-coordination.md).

## Tools

All tools require `aenea/read`. Mutations additionally require `aenea/write`. The server derives the household from verified Cognito `sub`, never from model-supplied arguments.

| Tool | Purpose |
|---|---|
| get_incident_status | Incident and latest saved assessment |
| get_incident_timeline | Paginated evidence, action and audit records |
| get_household_status | Legacy read-only historical reports and current virtual permissions; supports cursor |
| acknowledge_incident | Record acknowledgment, not resolution |
| request_safe_action | Request an existing assessed action through deterministic policy |
| confirm_action | Explicit approval bound to assessment_id; executor rechecks proposal identity, evidence, expiry and permissions |
| get_action_status | Read the saved outcome rather than infer success |
| get_responder_summary | Bounded synthetic handoff with an explicit partial flag; sends nothing |

Every tool requires `incident_id`. Action tools also require `action_id`; confirmation requires `assessment_id` and literal `confirm: true`. Incident/cursor ownership is checked. `report_person_status` is no longer advertised and direct legacy calls are rejected. Historical reports carry timestamps but never establish current location/safety. One Cognito identity owns one workspace; no family membership system is implemented.

Actions use the shared location-scoped executor with fresh-evidence/notes and catalog/settings guards. Read saved state after uncertain writes. The compatibility responder-summary read can be partial at its 50-record page boundaries; use timeline/report cursors for more. It sends nothing. Dedicated Household/Handoff navigation is retired; historic records are accessible in History and old URLs redirect there.

## OAuth onboarding

1. Deploy platform/app/mcp using the pipeline. The existing public `/config.json` supplies `apiUrl`, `clientId` and `cognitoDomain`; these are identifiers, not credentials.
2. The canonical MCP resource is `<apiUrl>/mcp`. Public resource metadata is at `<apiUrl>/.well-known/oauth-protected-resource/mcp` (also exposed without the `/mcp` suffix).
3. Use the metadata's Cognito issuer and its `/.well-known/openid-configuration` discovery document. For the web client, authorization/token endpoints are `<cognitoDomain>/oauth2/authorize` and `/oauth2/token`.
4. The preregistered public Cognito client uses authorization code + PKCE S256, verified OAuth state, exact `/auth/callback` URLs for the configured web origins and scopes `openid email aenea/read aenea/write`. No client secret or AWS key goes into the browser.
5. Authorization includes `resource=<apiUrl>/mcp`, causing Cognito to bind the access token audience to that resource. AgentCore and the private runtime enforce that audience; runtime verification additionally checks signature, expiry, issuer, registered client ID, access-token type and tool scopes. An ID token is never accepted as an access token.
6. Older unbound browser sessions require one fresh sign-in after rollout. The browser renews resource-bound access tokens on demand. Temporary refresh-service failures retain the session; invalid/revoked refresh tokens require sign-in. Saved incidents/settings are not removed.

Native Alexa+/external-client onboarding is **not verified**. Before attempting it, obtain that client's actual registration/callback requirements and register the appropriate client, scopes and exact callbacks through Terraform. Do not reuse fabricated callbacks or claim automatic dynamic registration. API Gateway may reject unauthenticated calls before the proxy; use the documented public metadata URL for preregistration/discovery rather than assuming a gateway-generated WWW-Authenticate challenge. A native client's compatibility with this path remains an acceptance gate.

References used for implementation: [AWS MCP runtime contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html), [JWT header forwarding](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-header-allowlist.html), [Cognito resource binding](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html), and [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.30.0).

## Infrastructure and rollout

`infra/mcp` owns a separate `mcp/terraform.tfstate`, private ARM64 Python ZIP bucket, narrowly scoped runtime role, JWT MCP runtime and SSM runtime-ARN parameter. The app proxy reads that parameter; the runtime invokes only the private tool Lambda. This avoids an app/runtime Terraform dependency cycle. The proxy validates browser Origins against the configured website origins. The domain stays `aenea.qleam.com`; no new domain, physical Alexa, Ring account or device is required.

Selective deployment: web-only edits build only web; `services/mcp/**` or `infra/mcp/**` package/apply MCP; tool Lambda edits update that function; shared domain edits update Lambda consumers. Platform changes refresh app and MCP wiring. Deployment-orchestrator changes refresh infrastructure dependencies. Offline tests run in the separate quality workflow; no post-deploy monitoring is added.

GitHub authenticates with OIDC; no browser or long-lived AWS key is required. AgentCore MCP lifecycle and SSM parameter permissions remain defined in the bootstrap templates. Treat the workflow result—not the source push alone—as deployment evidence.

Deferred hosted acceptance: PKCE sign-in/refresh, initialize/tools/list, persisted tool results, wrong-client/scoped-token denial, legacy report reads, expiry and cross-incident same-location valve veto, duplicate/concurrent actions, failures/timeouts, pagination, cold starts and optional microphone support. Capture actual results later; source tests are not hosted evidence.
