# Operations

Operate the deployed components with project-scoped AWS credentials. Account/environment isolation, a successful deployment and a working application are separate concerns.

## Cost estimate

Illustrative USD estimate, checked 6 October 2026 for us-east-1. This is a workload model, not the account's invoice or a production benchmark. Free tiers, credits, taxes, domain registration and development-tool subscriptions are excluded. The application uses pay-as-you-go hosting; no CloudFront flat-rate plan or AgentCore committed capacity is assumed.

### Workload assumptions

A 30-day month with 20 active test users, 3,000 accepted reports, 1,600 model calls (assessment/routing/question tasks combined), 300 MCP tool calls and 100,000 HTTP API requests. Assume 5,000 input/500 output tokens averaged across model calls, 2 GB of retained S3 objects/versions, 0.1 GB of DynamoDB/PITR data, 2 GB of ingested logs, 5 GB of CDN transfer and 100,000 HTTPS asset requests.

At 256 MB Lambda memory, assume 0.2 seconds for HTTP/ordinary calls, 0.1 seconds for empty scheduled ticks, and 15 seconds for each of 1,600 model-waiting invocations. Budget 12,000 additional short internal calls. DynamoDB usage is assumed to be 700,000 read and 300,000 write request units, including transactions, leases and polling—not simply counts of browser requests.

For runtime sensitivity, each model session assumes 0.5 active vCPU for 6 seconds and 0.5 GB for 75 seconds including idle retention. Each MCP call conservatively assumes 0.5 vCPU for 1 second and 0.5 GB for 60 seconds. These resource/time assumptions must be replaced with measured AgentCore consumption; memory/session reuse can materially change costs.

### Monthly breakdown

| Component | Calculation basis | USD/month |
| --- | --- | ---: |
| Nova Lite inference | 8M input tokens × $0.06/M + 0.8M output × $0.24/M | 0.67 |
| AgentCore reasoner + MCP | Above CPU/memory assumptions; published v1/v2 consumption-rate sensitivity | 0.30–0.50 |
| Lambda | Approximately 165,000 requests plus assumed 256 MB durations | 0.25 |
| HTTP API | 100,000 requests × $1/M | 0.10 |
| Step Functions Standard | 3,000 executions × 6 budgeted transitions × $0.000025 | 0.45 |
| EventBridge custom events | 3,000 events below 64 KB × $1/M | 0.003 |
| DynamoDB + PITR | Request units plus assumed stored data | 0.32 |
| S3 | 2 GB + 10,000 PUT/LIST + 100,000 GET requests | 0.14 |
| CloudFront | Example US edge rates; 5 GB transfer + 100,000 HTTPS requests | 0.53 |
| Logs + standard alarm | 2 GB log ingestion plus one standard alarm; storage allowance is covered by budget margin | 1.10 |
| Cognito | Illustrative Essentials rate for 20 users before included allowance; verify deployed tier | 0.30 |
| SQS/SNS/config operations | Small-workload allowance; no SMS or paid external delivery | 0.05 |
| **Calculated gross subtotal** | Excludes free allowances/credits | **4.21–4.41** |
| **Planning budget with margin** | Covers small variations and unmodelled minor charges | **4–8** |

The Nova Lite rates are published by AWS; [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) and [AWS's Nova model comparison](https://aws.amazon.com/blogs/machine-learning/prompting-for-the-best-price-performance/) document the pricing basis. [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) lists v1 CPU/memory at $0.0895/vCPU-hour and $0.00945/GB-hour, and v2 consumption at $0.1276/vCPU-hour and $0.0169/GB-hour. The source does not pin a billing generation; verify the deployed runtime's billing mode before treating either as an account forecast.

Other rate references: [Lambda](https://aws.amazon.com/lambda/pricing/), [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [Step Functions](https://aws.amazon.com/step-functions/pricing/), [EventBridge](https://aws.amazon.com/eventbridge/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [CloudFront pay-as-you-go](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) and [Cognito](https://aws.amazon.com/cognito/pricing/).

### Empty schedules and scaling

The source uses legacy EventBridge scheduled rules: one simulation tick per minute and one cleanup tick every five minutes. That is 43,200 + 8,640 = **51,840 scheduled Lambda invocations/month**, not that many AI requests.

For empty ticks at 256 MB/0.1 seconds, gross Lambda cost is about $0.032/month. Assuming three writes/two reads per simulation tick and two writes/two reads per cleanup tick, DynamoDB request-unit cost is about $0.105. The illustrative scheduler overhead is therefore **about $0.14/month**, excluding logs/storage. The simulation query can include its lock row and perform an extra cursor write; actual item sizes/pages affect this estimate. Active runs have additional delivery/model/storage work. Do not apply the separate EventBridge Scheduler product's free allowance to these legacy rules.

Ten times the active workload is a rough **$40–80/month** planning envelope, not a linear guarantee: fixed scheduling, runtime session reuse, model reuse, pages/item sizes, logs, free allowances and regional delivery change the curve. An idle deployment still retains storage, backups and alarms; it is not necessarily free.

Before public usage, measure Lambda billed duration, consumed DynamoDB request units, token counts, AgentCore CPU/memory and retained objects/logs. Compare those with Cost Explorer and billing budgets. Generation limits and browser closure do not cap account spending.

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
