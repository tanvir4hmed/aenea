# Devpost preparation — DRAFT, NOT SUBMITTED

Only use the final text after hosted acceptance and video review. Prepared 21 September 2026 against the [official rules](https://amazonappdev2026.devpost.com/rules) and [overview](https://amazonappdev2026.devpost.com/). The Alexa+ path must demonstrate working MCP/experience code, and the public English video must stay below three minutes. Source preparation alone is not eligibility or functionality proof.

## Project

**Name:** Aenea

**Tagline:** Shared household context, accountable incident coordination.

**Primary:** Alexa+

**Proposed minis:** AWS Builder; Open Source alongside the separate IncidentBridge contribution. Final entry selection is the owner's decision.

## Description draft

Aenea explores how a household can coordinate around one incident instead of managing disconnected alerts. Synthetic sensor and camera observations enter a real cloud event pipeline. A Strands/Bedrock reasoner proposes an assessment, while deterministic policy checks evidence and saved permissions before any virtual action. Camera motion never establishes occupancy or safety.

A clearly labeled Alexa+ web simulation calls an authenticated MCP server to read incident status, record household self-reports, acknowledge alerts and explicitly confirm eligible pending actions. The command center, household view and reviewable handoff use the same saved state. Failures and uncertainty remain visible; the system does not invent a successful device action or an all-clear.

The project is a prototype, not a certified alarm, medical device, professional monitoring service or replacement for emergency services. Devices and effects are simulated. It does not automatically dispatch responders, connect to Ring, or claim a verified native Alexa+ connection.

## How it is built

React web client; Cognito authorization-code/PKCE login with resource-bound tokens; AgentCore MCP server using Streamable HTTP and MCP 2025-11-25; private Lambda household tools; EventBridge/Step Functions incident processing; Strands plus Amazon Bedrock assessment; deterministic Lambda policy; DynamoDB state/audits; S3 evidence and static assets; CloudFront/Terraform/GitHub Actions deployment. IncidentBridge is imported from a pinned public commit to normalize and validate signals. See [AWS integrations](aws-builder.md).

## Links and missing evidence

- Source: https://github.com/tanvir4hmed/aenea
- Intended hosted entry: https://aenea.qleam.com — final availability/access not verified here.
- Public video: **not recorded/published yet; required before submission**.
- Judge credentials/access instructions: **not provisioned/verified here; supply privately if required**.
- Successful MCP/inference/action trace: **pending hosted verification**.
- New-project disclosure: project source was created during the challenge window; verify repository history and account/team details before final submission.

## Optional Open Source contribution

- Additional project: https://github.com/tanvir4hmed/incidentbridge
- Contribution used by Aenea: https://github.com/tanvir4hmed/incidentbridge/tree/53ab20a35e9f7b9b87504862228b7ace090dee68
- GitHub username: `tanvir4hmed`
- What: a separate Apache-2.0 Python library for normalized incident events, adapters and stable event identity.
- How: Aenea installs the pinned commit and calls its validation/normalization and idempotency helpers during actual ingress.
- Why: common event semantics and explicit simulation provenance make different household sources easier to compose and audit.
- Remaining gate: verify public visibility, license/tag/date and runtime consumption evidence. No new contribution/release was created in Phase 7.

## Feedback and evidence

Use [product feedback](product-feedback.md), [friction log](friction-log.md), [build evidence](build-evidence.md) and [demo runbook](demo-runbook.md). Complete observed onboarding/reliability/reuse answers after the deferred run; do not submit source-only notes as fabricated hands-on feedback. The final checklist is [release-checklist.md](release-checklist.md).
