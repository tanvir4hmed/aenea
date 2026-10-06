# AWS Builder integration

Aenea's implemented runtime paths use AWS SDK calls. Household observations are explicitly simulated; device actuation is not supported. This service map also supplies the AWS usage portion of [product feedback](product-feedback.md); observed onboarding/reliability feedback still needs completion.

| Service / SDK | Runtime responsibility |
|---|---|
| Amazon Bedrock AgentCore Runtime | IAM-authenticated reasoner and separate JWT-authenticated MCP runtime |
| Strands Agents SDK | Request-local agent and structured assessment generation |
| Amazon Bedrock | Amazon Nova inference, selected by BEDROCK_MODEL_ID |
| Step Functions | Evidence → assessment → briefing ordering |
| EventBridge | Normalized incident delivery and the scheduled cleanup trigger |
| Lambda | Trusted ingestion, AgentCore invocation, simulation scheduling and incident APIs |
| DynamoDB | Device catalog, evidence index, assessments, simulation runs and atomic incident/audit updates |
| S3 | Source evidence, versioned-by-hash runtime ZIP artifacts and frontend |
| Cognito / API Gateway | PKCE account access, scoped HTTP APIs and MCP proxy entry |
| CloudFront / ACM | HTTPS static application and custom-domain delivery |
| SSM | MCP runtime discovery without a circular Terraform dependency |
| IAM / GitHub OIDC | Federated deployment and scoped workload permissions |
| CloudWatch / SNS / SQS | Operational logs, alarm topic and failed-delivery queue |

The reasoner runtime has no household storage or execution authority. The separate MCP runtime may invoke only the private tools Lambda to read incident evidence and record acknowledgments. Model responses are schema/citation-checked and published only for the matching evidence revision. The reasoner also supplies constrained naming/routing explanations and bounded question intent classification; deterministic code controls create/join boundaries. Device commands are absent from the current contract.

Source evidence: `agent/reasoner/main.py`, `shared/assessment.py`, `infra/reasoner/main.tf`, `functions/invoke_reasoner/`, `functions/action_executor/`, and `workflows/incident_state_machine/definition.asl.json`.

Runtime traces and successful inference evidence are pending the deferred verification phase. Do not present source completion as runtime proof.

Implementation references:
- [AWS AgentCore Python ZIP deployment](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-python.html)
- [Terraform AWS 6.65.0 AgentCore runtime resource](https://github.com/hashicorp/terraform-provider-aws/blob/v6.65.0/website/docs/r/bedrockagentcore_agent_runtime.html.markdown)
- [Strands structured output](https://strandsagents.com/docs/user-guide/concepts/agents/structured-output/)
