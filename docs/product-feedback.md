# Product Feedback Log

Create one section for every tool, API or SDK actually used. Delete planned tools that are not used in the final build.

Runtime onboarding, reliability, performance and reuse judgments remain pending unless specifically evidenced below. For the final submission, complete those answers with actual observations for every inventory entry; this is not final experiential feedback.

## Implementation inventory — final observations still required

| Tool/service | Actual source use | Design observation / remaining feedback |
|---|---|---|
| AgentCore / SDK | Two hosted runtime configurations | Separates reasoner and MCP privileges; cold starts/onboarding pending |
| Strands / Bedrock | Structured assessment with Amazon Nova | Strict output boundary implemented; inference quality/latency pending |
| MCP Python SDK | Typed tools and Streamable HTTP | Shares tools across browser views; protocol/session reliability pending |
| Cognito / PyJWT | PKCE login, refresh and JWT verification | Client, token-type and scope boundaries explicit; hosted sign-in feedback pending |
| Lambda / Boto3 | Ingress, policy, execution, MCP bridge | Narrow task-specific handlers; SDK timeout/retry observations pending |
| EventBridge / Step Functions / SQS | Delivery, workflow, failure queue | Delivery failure and execution failure treated separately; recovery exercise pending |
| DynamoDB | Evidence, profiles, transactions, audit | Atomic check-in/action writes implemented; concurrency verification pending |
| S3 / CloudFront / ACM | Evidence, artifacts, web, TLS | Private origin and custom-domain source; final hosted/access review pending |
| IAM / GitHub OIDC | Scoped cloud deployment | User-reported missing permissions delayed earlier runs; see friction log |
| SSM | MCP runtime ARN discovery | Removes Terraform circular dependency; runtime observation pending |
| CloudWatch / SNS | Logs and operational alarm topic | Payload logging reduced; recipient delivery not configured/verified |
| IncidentBridge / Pydantic | Canonical input and assessment validation | Reusable strict boundaries; fresh-install regression verification pending |
| React / Vite | Web views and runner build | No new media/dependency for scenario cards; accessibility/build QA pending |
| Browser speech/clipboard/print | Optional interaction/export | Explicit user actions and fallbacks; browser support QA pending |
| Terraform / AWS provider / AWS CLI | Infrastructure and bootstrap | Import inputs/state errors hardened after reported bootstrap friction |
| GitHub Actions | Selective build/deploy | Source paths select deployment targets; final run not reviewed |

For each row before submission: record task, observed result, onboarding experience, improvement request, whether to reuse and why, and supporting trace/screenshot. Do not fabricate feedback before hands-on use. Include any additional developer tools actually used in the final process rather than treating this inventory as exhaustive.

## Workspace refresh observations — 24 September 2026

- React/Vite: production builds passed during the workspace phases. Browser, screen-reader and hosted usability acceptance remains pending.
- Python contracts/persistence boundaries: the Phase 8 offline suite passed 44 regressions; mocked persistence is not AWS integration proof. Phase 7 also passed six JavaScript checks.
- Cognito: the reported missing-audience error led to registered-client/scope validation and refresh handling. The fix is source-complete, not a claim of successful fresh hosted acceptance.
- GitHub Actions: path filters exclude documentation-only updates. Phase 8 deployment was triggered; its final result was not reviewed.
- Terraform/IAM: the scheduled cleanup rule needs a default-bus ARN permission absent from older live policies. The source template is updated; operator reconciliation is still a gate.

These observations supplement the inventory, not final answers about runtime reliability or willingness to reuse. Attach actual traces and owner experience during release verification.

## Phase 4 integration notes — 17 September 2026

- Terraform AWS provider 6.65.0: the documented AgentCore code_configuration resource permits a Terraform-owned Python ZIP runtime without another IaC tool. Implementation prepared; deployment usability/performance feedback remains pending.
- Strands Agents SDK 1.56.0: structured_output_model and a shared Pydantic contract map the agent response to the policy boundary. Runtime output quality and reliability remain untested.
- AgentCore SDK 1.23.1: the entrypoint API separates hosting from the reasoner's model code. ARM64 packaging is an explicit GitHub build step. Cold-start and deployment observations remain pending.
- Bedrock: read-only model availability APIs report Amazon Nova Lite authorized and available in us-east-1. No inference latency/quality feedback is asserted.
- Pydantic: reused strict contracts at both runtime and Lambda boundaries; contract regression execution is deferred.

## Phase 5 integration notes — 21 September 2026

- MCP Python SDK 1.30.0: source uses typed tool definitions and stateless Streamable HTTP. Hosted protocol negotiation and error behavior still require verification.
- Cognito: the hosted access token omitted `aud` because the current custom resource-server identifier is not a URL resource indicator. Source now uses PKCE with refresh tokens and validates issuer, signature, registered client, token type and custom scopes; native Alexa client onboarding is not verified.
- AgentCore: a separate MCP runtime invokes the private shared-tools Lambda. Documented session-ID/header forwarding is implemented; cold-start latency and usability observations remain pending.
