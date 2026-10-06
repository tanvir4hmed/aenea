# Aenea

Household signals, one shared incident picture.

Aenea turns simulated household device reports into named incidents, evidence-based assessments and concise spoken or written briefings. Its Alexa+ browser experience connects to a self-hosted MCP server and the same incident data used by Command Center.

[Open application](https://aenea.qleam.com) · [Read the user guide](https://aenea.qleam.com/guide)

## How it works

1. Check the supplied Maple House sensors or manage them in Settings.
2. Save a single alert or multi-device scenario in Simulation Studio.
3. Trigger saved definitions from Command Center.
4. Read or hear the assessment in Live assistance; ask questions about its evidence.
5. Review, rename, resolve or delete the incident.

Cloud simulation runs continue after the browser closes. Related alerts can join an open incident, while location/hazard rules separate unrelated reports. New evidence causes reassessment; repeated unchanged reports can reuse a valid assessment.

## System

![Aenea system architecture](docs/diagrams/system-architecture.png)

React and Vite provide the interface. AWS Lambda, EventBridge, Step Functions, DynamoDB and S3 process and retain evidence. A Bedrock AgentCore runtime hosts Strands agents using Amazon Bedrock; a separate AgentCore runtime hosts the authenticated MCP server. Terraform defines infrastructure and GitHub Actions deploys changed components.

[IncidentBridge](https://github.com/tanvir4hmed/incidentbridge) supplies the canonical event schema and normalization library.

## Documentation

| Guide | Covers |
| --- | --- |
| [User guide](docs/user-guide.md) | Setup, every main control, prerequisites and troubleshooting |
| [Architecture](docs/architecture.md) | System design, incident workflow, MCP integration and AWS AI processing |
| [API](docs/api.md) | Event contract, endpoints, tools, authentication and compatibility |
| [Deployment](docs/deployment.md) | Prerequisites, bootstrap, accounts, domain, selective releases and local checks |
| [Operations](docs/operations.md) | Recovery, limits, storage, deletion, privacy and observability |

## Development

Python 3.12, Node.js 22 and Terraform 1.10+ are the supported toolchain. From the repository root:

```sh
python -m venv .venv
# Activate the environment for your shell.
python -m pip install -r requirements-dev.txt
npm --prefix apps/web ci
npm --prefix apps/web run build
```

The frontend requires a deployed API, Cognito client and runtime configuration for authenticated use. Full setup and development-server instructions are in [Deployment](docs/deployment.md); verification and contribution conventions are in [CONTRIBUTING](CONTRIBUTING.md).

| Directory | Responsibility |
| --- | --- |
| `apps/web` | Household workspace, live assistance and browser speech |
| `functions`, `shared` | Validated ingestion, incidents, assessments, APIs and cleanup |
| `agent/reasoner` | AgentCore entry point, Strands agents and Bedrock calls |
| `services/mcp` | MCP 2025-11-25 Streamable HTTP server |
| `infra`, `workflows` | Terraform layers and event orchestration |
| `scripts`, `tests` | Deployment utilities and regression checks |

## Scope

The supplied house, devices and input signals are simulated. Assessments invoke the cloud model when needed; the UI does not manufacture model results. Speech uses browser services, with spoken updates requiring an open page. Native Alexa/Echo/Ring connectivity, physical device control, member management and emergency calling are not implemented. Follow official alarms and emergency guidance during real incidents.

## License and security

[Apache License 2.0](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Security policy](SECURITY.md)
