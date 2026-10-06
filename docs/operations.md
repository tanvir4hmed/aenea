# Operations

Operate the deployed components with project-scoped AWS credentials. Account/environment isolation, a successful deployment and a working application are separate concerns.

## Monitoring and recovery

| Symptom | Inspect | Recovery |
| --- | --- | --- |
| Deployment AccessDenied | GitHub run logs, exact action/resource, deployment-role policy | Update the scoped bootstrap template, reconcile IAM with administrator credentials, rerun the failed deployment |
| Signal accepted but no assessment | EventBridge delivery, SQS DLQ, Step Functions and reasoner logs | Diagnose delivery/model failure; use Retry assessment for an open incident |
| Simulation remains paused | Run message, pending identity, published counts and worker logs | Fix delivery/allowance problem, then Resume pending |
| Definition/catalog save conflicts | Current revision and other active sessions | Refresh before saving; do not overwrite blindly |
| Sign-in repeatedly fails | Matching config/origin, Cognito callback, resource-bound token and browser session | Reload matching frontend/config; sign in again if session revoked or expired |
| MCP request fails | API Gateway, fixed proxy, SSM runtime ARN, AgentCore/tool logs | Check token/audience/scopes and runtime permissions; uncertain writes require a status read before retry |
| Cleanup remains pending | Cleanup rule/target, Lambda logs, job phase and IAM | Correct scheduling/access; pending is not proof of completed deletion |

CloudWatch records application/service logs and metrics. Application/workflow log retention is fourteen days; runtime-created logs need their own retention review. An SQS DLQ retains failed event deliveries. The operations SNS topic has no recipient until a subscription is configured and confirmed.

GitHub deployment errors do not imply application data is deleted. Terraform may have applied only part of a failed plan. Preserve remote state and retry from the reported state; never clear state to hide an error.

## Pausing new signals

Set GitHub `INGESTION_ENABLED=false` and deploy component **app**. After the configuration deploys, new ingress returns 503 before accepting evidence. Restore `true` and deploy to resume.

Changing a GitHub variable alone does not change a running Lambda. This control does not stop in-flight workflows, reads, scheduled-worker attempts or storage charges. Stop individual simulation runs through Command Center when appropriate.

## Simulation and processing bounds

- Up to 200 catalog devices, 30 per room, 250 saved definitions and 2,000 saved signal references.
- Up to 200 distinct sensors per run; duplicate batch selections and concurrent device ownership are rejected.
- Each incident starts with 2,000 practice signals, extendable deliberately to 10,000. Exhaustion pauses new generation, not the incident or accepted evidence processing.
- Scheduled generation is checked once per minute. The worker uses a lease, bounded invocation and fairness cursor; delivery can be later than its scheduled timestamp.
- New Studio definitions use active/online state, Once or a finite repeat interval, and no automatic clear. Stop does not clear a reported alarm.
- Model input contains at most 32 representative evidence events with aggregates; evidence storage has no twenty-report incident cutoff.
- Changed evidence can invalidate a previous assessment. Unchanged state may reuse an eligible result. Reassessment attempts are bounded and failure is visible.

These controls are not a monetary spending cap. Configure AWS billing budgets/alerts and watch model calls, polling, logs, object versions and stored data. Browser closure stops visible polling/speech, not durable runs.

## Severity

Ordinary doorbell, motion, package, vehicle/person and normal contact-open signals are informational. Water leaks, severe weather, freeze risk, power outage and tamper signals are warnings. CO, gas leak, medical SOS, security alarm, forced entry and glass break are immediately urgent.

Smoke/heat starts at warning. Distinct active fire/gas sensors corroborating in the same trusted room produce urgent/red state. Repeats from one sensor do not count as independent corroboration. A current validated assessment may raise cited-device urgency but cannot lower the deterministic floor. Signals are reported evidence, not a diagnosis or proof of safety.

## Storage, deletion and reset

Evidence objects are versioned. Deleting a recipe or sensor does not erase historical incident evidence. Incident deletion first blocks further work, waits a fifteen-minute drain, then scheduled cleanup removes application records, related runs and evidence object versions/delete markers. Minimal replay guards prevent delayed retries from recreating deleted incidents.

Check the deletion's final status. PITR backups, service logs, workflow execution history and exported copies follow their own retention; the application purge does not erase those.

`scripts/reset_demo.py` is an administrator utility for an explicitly requested application-data reset. It is dry-run by default and requires the account confirmation and project ownership checks. It pauses writers/schedules, drains in-flight work, preserves login/infrastructure/state and restores service configuration. Review its inventory before adding `--execute`; it never runs from deployment. Its filename is a utility identifier, not a separate application mode.

Never delete the CLI-owned state bucket while any Terraform layer references it. App cleanup is not infrastructure destruction.

## Privacy and access boundaries

One Cognito subject owns one dataset. A shared guest identity shares its records; use fictional data there. Secrets, tokens, real camera footage and personal health/location information do not belong in source or diagnostic logs.

MCP validates signed access tokens, issuer, resource audience, expiry, registered client and tool scopes. The verified subject owns the partition. Observation text and model input cannot grant permissions. The reasoner has no direct database or device authority. Household isolation on the shared table is enforced by application code, not separate per-user IAM roles.

Browser speech may use the browser vendor's service. Conversation history is browser-local, bounded to twenty replies per incident and seven days. Sign-out/Clear removes it. Cloud notes and historical reports, where present, remain unverified context.

Protect GitHub's exact OIDC trust and `dev` environment. The deployment role can manage project resources and is broader than workload roles. Dependency scanning, operational load testing and security review are continuing engineering responsibilities. Report vulnerabilities using [the security policy](../SECURITY.md).
