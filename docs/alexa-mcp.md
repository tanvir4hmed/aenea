# Phase 5: Alexa+ experience and MCP

Source implemented on 21 September 2026. GitHub Actions owns packaging and deployment. Hosted acceptance is deferred: this document does not claim a working native Alexa connection or a successful hosted MCP invocation.

## Shared coordination path

The `/alexa-sim` browser view is an MCP client, not a separate mock backend:

Browser → API Gateway `POST /mcp` → fixed-upstream proxy → JWT-authenticated AgentCore MCP runtime → private household-tools Lambda → the same DynamoDB records and deterministic action executor as the command center.

The MCP server uses Python SDK 1.30.0, Streamable HTTP, protocol negotiation for `2025-11-25`, stateless HTTP and JSON responses. AgentCore session IDs are passed back to the browser and reused for runtime affinity; household state never depends on that session. `GET /mcp` returns 405 because no standalone SSE subscription is offered. Requests/responses are limited to 64 KB/200 KB, with a 20-second upstream timeout. Timed-out writes are not automatically retried: read their saved status first.

The simulator supports five explicit English phrases, corresponding buttons, check-in controls and action-specific confirmation buttons. Optional browser speech recognition fills editable text; it does not submit automatically. Optional browser text-to-speech reads the tool-derived reply. This is not Alexa speech recognition or a free-form conversational model. Browser microphone processing may use the browser vendor's speech service; use only synthetic demo information.

## Tools

All tools require `aenea/read`. Mutations additionally require `aenea/write`. The server derives the household from verified Cognito `sub`, never from model-supplied arguments.

| Tool | Purpose |
|---|---|
| get_incident_status | Incident and latest saved assessment |
| get_incident_timeline | Paginated evidence, action and audit records |
| get_household_status | Incident-scoped self-reports and virtual permissions; supports cursor |
| report_person_status | Save synthetic check-in and its audit atomically |
| acknowledge_incident | Record acknowledgment, not resolution |
| request_safe_action | Request an existing assessed action through deterministic policy |
| confirm_action | Explicit approval for a pending action; executor rechecks evidence, expiry and permissions |
| get_action_status | Read the saved outcome rather than infer success |
| get_responder_summary | Bounded synthetic handoff with an explicit partial flag; sends nothing |

Every tool requires `incident_id`. Action tools additionally require `action_id`; confirmation requires literal `confirm: true`. Check-in arguments are `person` (synthetic name) and `status`: `unknown`, `safe`, `needs_help`, or `not_home`. Incident and cursor ownership are checked before access. Household status never imports a safe check-in from an older incident. Self-reports carry timestamps and are not verified location/safety. One Cognito identity currently represents one demo household, not a multi-user family membership system.

Actions use the existing Phase 4 executor; no new physical-device capabilities or emergency dispatch were added. Check-in/acknowledgment retries can add evidence; do not blindly replay writes. A handoff can be partial when the 50-record/page limit is reached; use timeline/household cursors for further review. Dedicated household and handoff views remain Phase 6.

## OAuth onboarding

1. Deploy platform/app/mcp using the pipeline. The existing public `/config.json` supplies `apiUrl`, `clientId` and `cognitoDomain`; these are identifiers, not credentials.
2. The canonical MCP resource is `<apiUrl>/mcp`. Public resource metadata is at `<apiUrl>/.well-known/oauth-protected-resource/mcp` (also exposed without the `/mcp` suffix).
3. Use the metadata's Cognito issuer and its `/.well-known/openid-configuration` discovery document. For the web client, authorization/token endpoints are `<cognitoDomain>/oauth2/authorize` and `/oauth2/token`.
4. The preregistered public Cognito client uses authorization code + PKCE S256, verified OAuth state, exact `/auth/callback` URLs for the configured web origins and scopes `openid email aenea/read aenea/write`. No client secret or AWS key goes into the browser.
5. Both authorization and token requests include `resource=<apiUrl>/mcp`. The MCP runtime independently verifies JWT signature, expiry, issuer, client ID, access-token type and resource audience. The gateway accepts the resource-bound audience; the private Lambda separately enforces tool scopes.
6. Sign out and in after this rollout: an older browser token lacks resource binding and will be rejected by the MCP runtime. The 15-minute browser session currently requires a fresh sign-in after expiry; silent refresh is not implemented.

Native Alexa+/external-client onboarding is **not verified**. Before attempting it, obtain that client's actual registration/callback requirements and register the appropriate client, scopes and exact callbacks through Terraform. Do not reuse fabricated callbacks or claim automatic dynamic registration. API Gateway may reject unauthenticated calls before the proxy; use the documented public metadata URL for preregistration/discovery rather than assuming a gateway-generated WWW-Authenticate challenge. A native client's compatibility with this path remains an acceptance gate.

References used for implementation: [AWS MCP runtime contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-mcp-protocol-contract.html), [JWT header forwarding](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-header-allowlist.html), [Cognito resource binding](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html), and [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.30.0).

## Infrastructure and rollout

`infra/mcp` owns a separate `mcp/terraform.tfstate`, private ARM64 Python ZIP bucket, narrowly scoped runtime role, JWT MCP runtime and SSM runtime-ARN parameter. The app proxy reads that parameter; the runtime invokes only the private tool Lambda. This avoids an app/runtime Terraform dependency cycle. The proxy validates browser Origins against the configured website origins. The domain stays `aenea.qleam.com`; no new domain, physical Alexa, Ring account or device is required.

Selective deployment: web-only edits build only web; `services/mcp/**` or `infra/mcp/**` package/apply MCP; tool Lambda edits update that function; shared domain edits update Lambda consumers. Platform changes refresh app and MCP wiring. Deployment-orchestrator changes refresh infrastructure dependencies. No test suite or post-deploy monitoring is added.

**Outstanding prerequisite:** the AWS administrator CLI login is expired. Phase 4–5 deployment-role permissions in the bootstrap templates still need live synchronization after `aws login` (or an authorized CloudShell login). The new workflow permissions include AgentCore MCP lifecycle and SSM parameter management. GitHub still authenticates with OIDC; no new GitHub secret is required. Do not interpret a source push as permission synchronization or successful deployment.

Deferred hosted acceptance: PKCE sign-in/resource audience, initialize and tools/list, every tool's persisted result, cross-household/scoped-token denial, stale check-ins, action expiry and smoke/valve exclusion, duplicate/concurrent actions, failed writes/timeouts, multi-page results, runtime cold starts and optional microphone support. Capture actual results later; no passing runtime evidence is asserted here.
