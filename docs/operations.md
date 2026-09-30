# Operations and cost boundaries

Source updated 30 September 2026. Operational checks remain separate. No live budget, billing recipient, IAM reconciliation or account cleanup was performed by this source change.

## Spend controls

Existing controls include an authenticated API with request throttling, disabled self-signup, bounded evidence/tool pages, bounded model input, 14-day application/workflow log retention and short AgentCore runtime idle/lifetime settings. These reduce exposure; they are **not a dollar spending cap**. Model calls, idle resources, object versions, traces and retained state can still incur charges. AgentCore runtime-created logs need a separate retention review; the application's 14-day setting does not cover every service automatically.

An operator can set GitHub variable `INGESTION_ENABLED=false` in the `dev` environment and dispatch `Deploy changed components` with `app`. This refreshes app configuration without rebuilding the frontend or either AgentCore runtime. After that configuration successfully deploys, new `POST /events` requests return 503 before database/S3/EventBridge writes. Set it back to `true` and deploy to resume. Changing the GitHub variable alone does not pause the deployed Lambda. This does not stop in-flight workflows, MCP reads/writes, other API requests or storage charges. Verify the pause later; it was not exercised here.

Before opening judge access, the account owner must select a monthly budget and notification address and configure/verify AWS billing alerts. Alerts are not hard caps. Do not stop or destroy judge access without confirming the required availability period. No automatic destroy job is installed. Terraform state/evidence are retained; the CLI-owned state bucket must not be deleted while referenced by any layer.

## Failure and retry

### Incident cleanup

Before rolling out scheduling, reconcile bootstrap policy with an authorized administrator session using `python scripts/reconcile_bootstrap.py`. Exact default-bus rule ARNs include `aenea-cleanup` and the new `aenea-simulation`; custom-bus-only patterns do not cover them. Re-run app deployment after reconciliation if necessary. No new secret is required. Live IAM synchronization is not performed by a source push.

User-requested deletion blocks new work and queues cleanup after a 15-minute drain window. The worker runs every five minutes with concurrency one. Monitor pending/retrying jobs and the cleanup Lambda log/error metrics if a request stays incomplete. Failure to invoke the worker leaves requests pending; it must not be described as successful physical deletion. Inspect IAM and rule/target configuration before retrying deployment. Deletion never removes Terraform state or shared resources.

The worker removes active DynamoDB incident data, associated receipts, applicable virtual output state and every version/delete marker of the incident's S3 evidence. It retains a minimal permanent deletion marker. PITR backups, workflow execution history, service logs and exported copies are outside this API's purge boundary; retention must be managed separately. No operator cleanup or user-data deletion was executed as part of Phase 8 implementation.

### Event and action retries

- Signal ingress uses a stable event ID and payload; an identical retry is accepted without another correlated event. Changed payload with the same identity is rejected.
- New person reporting is retired. Optional notes and cloud runs use stable UUID request identities; retry unchanged requests, not newly identified duplicates. Read current state after uncertain writes.
- Acknowledgment and its unique audit commit together. Repeated acknowledgment does not resolve the incident or duplicate the audit.
- Virtual actions retain the existing deterministic action identity and transactional policy/execution checks. Concurrent settings/evidence changes fail closed.
- MCP proxy timeout does not prove failure: read saved state before retrying a mutation. Private Lambda invocation disables SDK automatic retries; the browser does not automatically replay writes.
- Delivery DLQ, failed Step Functions executions and model failures require operator review; no fabricated recovery is emitted. Operations SNS has no verified recipient until explicitly configured.

## Security review boundaries

Public metadata contains identifiers only. JWT signature, issuer, registered client, access-token type, resource-bound audience and scope checks protect MCP. Old unbound sessions must sign in again. Household partition checks remain separate. Proxy SSM access is limited to this account's runtime parameter. The reasoner cannot access storage or execute devices. The private tool Lambda has no public API route. Application roles are project-scoped; shared-table tenancy is enforced in code, not per-household IAM credentials.

The simulation worker has a 240-second lease around a 170-second invocation, a persistent fairness cursor and explicit pause state on delivery failure. Check the run message, published/reserved counts and worker error metrics. Stop leaves accepted evidence intact; never equate stop/exhaustion with clear. No application limit is a monetary AWS spending cap. See [scheduling and migration](state-driven-coordination.md).

The deployment role remains intentionally broader than application roles: it can manage project-prefixed roles and resources. GitHub environment protection and exact OIDC trust are critical. A full external IAM audit, dependency vulnerability review, token/session threat review and adversarial hosted tests are still release gates. Do not describe this prototype as production-hardened.

Use `docs/release-checklist.md` for the remaining operator gates. No passwords, access tokens, real health/location details or actual camera footage belong in public logs, evidence or the repository.
