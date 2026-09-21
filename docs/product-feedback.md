# Product Feedback Log

Create one section for every tool, API or SDK actually used. Delete planned tools that are not used in the final build.

## Tool or service name

- Used for:
- What worked well:
- What needs improvement:
- Onboarding experience:
- Reliability or performance observations:
- Workaround required:
- Would we use it again, and why:
- Supporting issue, screenshot or trace:

Do not fabricate feedback before hands-on use.

## Phase 4 integration notes — 17 September 2026

- Terraform AWS provider 6.65.0: the documented AgentCore code_configuration resource permits a Terraform-owned Python ZIP runtime without another IaC tool. Implementation prepared; deployment usability/performance feedback remains pending.
- Strands Agents SDK 1.56.0: structured_output_model and a shared Pydantic contract map the agent response to the policy boundary. Runtime output quality and reliability remain untested.
- AgentCore SDK 1.23.1: the entrypoint API separates hosting from the reasoner's model code. ARM64 packaging is an explicit GitHub build step. Cold-start and deployment observations remain pending.
- Bedrock: read-only model availability APIs report Amazon Nova Lite authorized and available in us-east-1. No inference latency/quality feedback is asserted.
- Pydantic: reused strict contracts at both runtime and Lambda boundaries; contract regression execution is deferred.

## Phase 5 integration notes — 21 September 2026

- MCP Python SDK 1.30.0: source uses typed tool definitions and stateless Streamable HTTP. Hosted protocol negotiation and error behavior still require verification.
- Cognito: source extends existing PKCE login with resource-bound access tokens and public resource metadata. Native Alexa client onboarding is not verified; no onboarding-success claim is made.
- AgentCore: a separate MCP runtime invokes the private shared-tools Lambda. Documented session-ID/header forwarding is implemented; cold-start latency and usability observations remain pending.
