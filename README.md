# Aenea

Aenea is an Alexa+-centered prototype for household incident coordination. Its intended full workflow combines simulated household signals, an auditable incident timeline, household check-ins and policy-gated device actions. The current implementation covers cloud foundation, authenticated simulation ingestion and incident evidence timelines.

> **Safety notice:** Aenea is a hackathon prototype for coordination and decision support. It is not a certified alarm, monitoring service, medical device, or replacement for emergency services. It does not automatically contact emergency responders.

## Status

Phases 2–3 implementation is written: Terraform layers, React shell with Cognito PKCE sign-in, authenticated APIs, IncidentBridge ingestion, evidence S3, EventBridge/Step Functions and DynamoDB timelines. Pushes trigger component-specific GitHub build/deployment. Deployment results and end-to-end verification are deferred; a working cloud deployment is not yet claimed.

The Alexa+, household check-in and handoff routes are explicit placeholders for later phases. The reasoner and device policy/action execution are Phase 4 work.

## Planned proof path

- Primary track: Alexa+
- Judge-visible Alexa+ web simulation using the same state and tools as the backend
- MCP 2025-11-25 Streamable HTTP endpoint
- Strands + Amazon Bedrock workload hosted on Amazon Bedrock AgentCore Runtime
- Hosted camera, sensor, check-in and virtual-device simulations that enter the real backend
- `incidentbridge` imported and executed at runtime

No Ring API, Ring account, physical Alexa or physical smart-home device is required for the planned Alexa+ submission. Native Alexa+ connectivity will be claimed only if it is later implemented and verified; the required demo path is a clearly labeled Alexa+ web simulation backed by the same hosted MCP/domain state.

## Documentation

- [Project timeline](docs/project-timeline.md)
- [Safety and claims](docs/safety.md)
- [Architecture status](docs/architecture.md)
- [Final architecture](docs/architecture/01_aenea_architecture_overview_final.png)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Build evidence](docs/build-evidence.md)
- [Product feedback](docs/product-feedback.md)
- [Friction log](docs/friction-log.md)
- [Cloud deployment and required account configuration](docs/deployment.md)
- [One-time CloudShell bootstrap](docs/cloudshell-bootstrap.md)
- [Event pipeline and API semantics](docs/event-pipeline.md)

Use the deployment guide to bootstrap AWS access in a cloud workspace, configure the GitHub demo environment, and dispatch the initial all-components deploy. Future pushes deploy only affected components; docs-only changes do not deploy. No local application build is required.

## License

Apache License 2.0. See `LICENSE`.
