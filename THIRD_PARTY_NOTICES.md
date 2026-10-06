# Third-Party Notices

Source dependencies currently referenced:

- [Strands Agents SDK](https://github.com/strands-agents/sdk-python), Apache-2.0: Bedrock agent and structured output.
- [Bedrock AgentCore SDK](https://github.com/aws/bedrock-agentcore-sdk-python), Apache-2.0: hosted Python runtime entry point.
- [Pydantic](https://github.com/pydantic/pydantic), MIT: strict assessment schemas.
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk), MIT: MCP tools and Streamable HTTP server.
- [PyJWT](https://github.com/jpadilla/pyjwt), MIT: JWT signature, issuer, audience and claim validation.

- [IncidentBridge](https://github.com/tanvir4hmed/incidentbridge), Apache-2.0: canonical events and validation; pinned to the commit declared in `functions/requirements.txt`.
- [Boto3](https://github.com/boto/boto3), Apache-2.0: AWS SDK calls from Python handlers.
- [Moto](https://github.com/getmoto/moto), Apache-2.0: development-only offline AWS transaction tests; not deployed with Lambda/runtime packages.
- [React](https://github.com/facebook/react), MIT: browser interface.
- [Vite](https://github.com/vitejs/vite), MIT: browser build tool.
- [Terraform](https://github.com/hashicorp/terraform), BUSL-1.1 for current releases: infrastructure CLI; [AWS provider](https://github.com/hashicorp/terraform-provider-aws), MPL-2.0.
- GitHub-hosted Actions: checkout, setup-python, setup-node and configure-aws-credentials (MIT); setup-terraform (MPL-2.0). Upstream repositories retain their own notices.

AWS service and GitHub usage is subject to the applicable account/service terms. Transitive dependencies retain their own licenses. No third-party package is vendored into this repository; build artifacts include installed dependencies.

The diagrams are project-maintained SVG artwork incorporating service symbols from the [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) package dated 31 July 2026. AWS/product names and symbols remain their respective owners' marks; use follows the provider's architecture-icon terms. No endorsement is implied. Example household observations are synthetic.
