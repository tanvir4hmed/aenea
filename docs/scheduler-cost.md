# Simulation scheduler cost estimate

30 September 2026; us-east-1; estimates, not measured account billing.

The deployed design uses a legacy EventBridge scheduled rule (`aenea-simulation`) once per minute. This is one shared worker, not one rule per device or household. A 30-day month has 43,200 invocations. No model runs merely because the scheduler wakes up with an empty queue.

An empty tick uses a 256 MB Lambda and approximately three small DynamoDB updates, one strongly consistent read and one small query. Assuming 1 KB writes, reads within 4 KB, and average billed Lambda duration of 0.1–1 second:

| Incremental idle component | Approximate monthly cost, before free allowances |
| --- | --- |
| Lambda requests at $0.20/million | $0.00864 |
| Lambda compute at $0.0000166667/GB-second | $0.018–$0.180 |
| DynamoDB at $0.625/million writes and $0.125/million reads | $0.092 |
| Logging and schedule pricing margin | Allow several cents |

A practical rough idle budget is **$0.15–$0.50/month**, conditional on those durations and item sizes. Free allowances may reduce it. This is not a limit on the total bill. Active runs add worker time, ingress, state-machine transitions, evidence/storage, model and AgentCore consumption. Duration, payload size, active/paused run count and account-wide free-tier use can change the total.

Pricing references: [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [EventBridge](https://aws.amazon.com/eventbridge/pricing/). The separate EventBridge Scheduler free invocation allowance should not be assumed for this legacy scheduled rule.

Recommendation: retain the minute cadence for now, measure actual billed duration and active-run usage after deployment. If idle operation matters at larger scale, migrate to schedules created only for active runs, with reliable cancellation, retries and concurrent start/stop handling. Increasing the current interval saves little and delays simulated state delivery. No scheduler resources or cadence were changed in this UI update.
