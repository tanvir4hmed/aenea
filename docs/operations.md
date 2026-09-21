# Demo operations and cost boundaries

Implementation review: 21 September 2026. Operational checks remain deferred. No budget amount, billing recipient, IAM change or account cleanup was silently configured in this phase.

## Spend controls

Existing controls include an authenticated API with request throttling, disabled self-signup, bounded evidence/tool pages, bounded model input, 14-day application/workflow log retention and short AgentCore runtime idle/lifetime settings. These reduce exposure; they are **not a dollar spending cap**. Model calls, idle resources, object versions, traces and retained state can still incur charges. AgentCore runtime-created logs need a separate retention review; the application's 14-day setting does not cover every service automatically.

An operator can set GitHub variable `INGESTION_ENABLED=false` (repository or demo environment) and dispatch `Deploy changed components` with `app`. This refreshes app configuration without rebuilding the frontend or either AgentCore runtime. After that configuration successfully deploys, new `POST /events` requests return 503 before database/S3/EventBridge writes. Set it back to `true` and deploy to resume. Changing the GitHub variable alone does not pause the deployed Lambda. This does not stop in-flight workflows, MCP reads/writes, other API requests or storage charges. Verify the pause later; it was not exercised here.

Before opening judge access, the account owner must select a monthly budget and notification address and configure/verify AWS billing alerts. Alerts are not hard caps. Do not stop or destroy judge access without confirming the required availability period. No automatic destroy job is installed. Terraform state/evidence are retained; the CLI-owned state bucket must not be deleted while referenced by any layer.

## Failure and retry

- Signal ingress uses a stable event ID and payload; an identical retry is accepted without another correlated event. Changed payload with the same identity is rejected.
- Check-in tool requires a UUID `request_id`. Its audit and latest person state commit atomically. Reusing the ID with identical person/status returns the recorded original result without overwriting a newer check-in; differing content is rejected. The browser retains the ID for uncertain retries in the current MCP client instance only. After navigation/reload, read current reports before writing again.
- Acknowledgment and its unique audit commit together. Repeated acknowledgment does not resolve the incident or duplicate the audit.
- Virtual actions retain the existing deterministic action identity and transactional policy/execution checks. Concurrent settings/evidence changes fail closed.
- MCP proxy timeout does not prove failure: read saved state before retrying a mutation. Private Lambda invocation disables SDK automatic retries; the browser does not automatically replay writes.
- Delivery DLQ, failed Step Functions executions and model failures require operator review; no fabricated recovery is emitted. Operations SNS has no verified recipient until explicitly configured.

## Security review boundaries

Public metadata contains identifiers only. JWT signature/issuer/audience/client/access-token checks protect MCP; tool scopes and household partition checks remain separate. Proxy SSM access is limited to this account's single runtime parameter. The reasoner cannot access household storage or execute devices; only its model output reaches policy. The private MCP tool Lambda has no API route. Application roles are limited to project resources, but shared-table tenancy is enforced in code, not by per-household IAM credentials.

The deployment role remains intentionally broader than application roles: it can manage project-prefixed roles and resources. GitHub environment protection and exact OIDC trust are critical. A full external IAM audit, dependency vulnerability review, token/session threat review and adversarial hosted tests are still release gates. Do not describe this prototype as production-hardened.

Use `docs/release-checklist.md` for the remaining operator gates. No passwords, access tokens, real health/location details or actual camera footage belong in public logs, evidence or the repository.
