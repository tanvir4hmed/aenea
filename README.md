# Aenea

Aenea is an Alexa+-centered prototype for household incident coordination. It correlates labeled simulated safety, camera/doorbell and household signals, keeps an auditable incident timeline, asks household members for status, and gates every proposed device action through deterministic policy.

> **Safety notice:** Aenea is a hackathon prototype for coordination and decision support. It is not a certified alarm, monitoring service, medical device, or replacement for emergency services. It does not automatically contact emergency responders.

## Status

Phase 0: repository and technical-feasibility baseline. The working implementation will be built during the Amazon App Dev Challenge 2026 window. Do not treat planned capabilities as implemented until they appear in the source and test evidence.

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

Build and deployment instructions will be added with the first executable vertical slice so this README never advertises commands that do not work.

## License

Apache License 2.0. See `LICENSE`.
