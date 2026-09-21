# AWS Builder integration

Aenea's implemented Phase 4 path uses real AWS SDK calls. Household observations and device effects remain explicitly simulated.

| Service / SDK | Runtime responsibility |
|---|---|
| Amazon Bedrock AgentCore Runtime | IAM-authenticated Python reasoner hosting |
| Strands Agents SDK | Request-local agent and structured assessment generation |
| Amazon Bedrock | Amazon Nova inference, selected by BEDROCK_MODEL_ID |
| Step Functions | Evidence → assessment → policy → execution ordering |
| EventBridge | Normalized incident delivery |
| Lambda | Trusted ingestion, AgentCore invocation, deterministic authorization and virtual execution |
| DynamoDB | Household profiles, evidence index, assessments, action state and atomic audit/device updates |
| S3 | Source evidence, versioned-by-hash runtime ZIP artifacts and frontend |

AgentCore has no authority to execute devices. The policy/executor uses saved household permissions and rechecks evidence independently of the model's proposed severity or confidence.

Source evidence: `agent/reasoner/main.py`, `shared/assessment.py`, `infra/reasoner/main.tf`, `functions/invoke_reasoner/`, `functions/policy/`, `functions/action_executor/`, and `workflows/incident_state_machine/definition.asl.json`.

Runtime traces and successful inference evidence are pending the deferred verification phase. Do not present source completion as runtime proof.

Implementation references:
- [AWS AgentCore Python ZIP deployment](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-python.html)
- [Terraform AWS 6.65.0 AgentCore runtime resource](https://github.com/hashicorp/terraform-provider-aws/blob/v6.65.0/website/docs/r/bedrockagentcore_agent_runtime.html.markdown)
- [Strands structured output](https://strandsagents.com/docs/user-guide/concepts/agents/structured-output/)
