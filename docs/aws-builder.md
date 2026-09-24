# AWS Builder integration

Aenea's implemented runtime paths use AWS SDK calls. Household observations and device effects remain explicitly simulated. This service map also supplies the AWS usage portion of [product feedback](product-feedback.md); observed onboarding/reliability feedback still needs completion.

| Service / SDK | Runtime responsibility |
|---|---|
| Amazon Bedrock AgentCore Runtime | IAM-authenticated reasoner and separate JWT-authenticated MCP runtime |
| Strands Agents SDK | Request-local agent and structured assessment generation |
| Amazon Bedrock | Amazon Nova inference, selected by BEDROCK_MODEL_ID |
| Step Functions | Evidence → assessment → policy → execution ordering |
| EventBridge | Normalized incident delivery and the scheduled cleanup trigger |
| Lambda | Trusted ingestion, AgentCore invocation, deterministic authorization and virtual execution |
| DynamoDB | Household profiles, evidence index, assessments, action state and atomic audit/device updates |
| S3 | Source evidence, versioned-by-hash runtime ZIP artifacts and frontend |
| Cognito / API Gateway | PKCE account access, scoped HTTP APIs and MCP proxy entry |
| CloudFront / ACM | HTTPS static application and custom-domain delivery |
| SSM | MCP runtime discovery without a circular Terraform dependency |
| IAM / GitHub OIDC | Federated deployment and scoped workload permissions |
| CloudWatch / SNS / SQS | Operational logs, alarm topic and failed-delivery queue |

The reasoner runtime has no household storage or execution authority. The separate MCP runtime may invoke only the private tools Lambda, which reuses the deterministic executor. The policy/executor uses saved household permissions and rechecks evidence independently of the model's proposed severity or confidence. All effects remain virtual.

Source evidence: `agent/reasoner/main.py`, `shared/assessment.py`, `infra/reasoner/main.tf`, `functions/invoke_reasoner/`, `functions/policy/`, `functions/action_executor/`, and `workflows/incident_state_machine/definition.asl.json`.

Runtime traces and successful inference evidence are pending the deferred verification phase. Do not present source completion as runtime proof.

Implementation references:
- [AWS AgentCore Python ZIP deployment](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-python.html)
- [Terraform AWS 6.65.0 AgentCore runtime resource](https://github.com/hashicorp/terraform-provider-aws/blob/v6.65.0/website/docs/r/bedrockagentcore_agent_runtime.html.markdown)
- [Strands structured output](https://strandsagents.com/docs/user-guide/concepts/agents/structured-output/)
