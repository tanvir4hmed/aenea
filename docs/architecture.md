# Architecture Status

The implementation target is an evidence-first vertical slice: web simulator and command center -> Aenea application/MCP tools -> IncidentBridge normalization -> incident timeline and deterministic policy -> virtual actions, with Strands + Bedrock hosted on AgentCore Runtime and DynamoDB persistence.

The [final architecture diagram](architecture/01_aenea_architecture_overview_final.png) is the unchanged v1 design baseline selected for implementation. Its Ring/vendor labels denote simulated source/action categories in the Alexa+ demo, not working vendor integrations. The text documentation and verified deployed configuration govern implementation details.

Camera/doorbell, sensor, weather, household and device events are synthetic and visibly labeled. They still enter the real hosted backend through HTTP. No Ring API, official Ring simulator, Ring credentials, physical Alexa or physical IoT device is required.

Guided scenarios and the device-driven Simulation Studio use the same ingestion endpoint. Household and Handoff views use existing MCP tools, not another datastore. Copy/print is user-initiated and no responder integration is implied.

The workspace refresh adds tenant-owned location/device catalogs, evidence revisions and transactional review/action guards to the existing storage and Lambda boundaries. Phase 8 adds an EventBridge scheduled cleanup Lambda and deletion jobs/markers. The reasoner currently caps assessment input at 20 signals. See [current phase details](workspace-refresh.md) for concurrency, cleanup and capacity limits; these details are not represented as new boxes in the unchanged baseline image.

Phases 2–3 infrastructure and web deployment succeeded on 17 September 2026. Phase 4 source adds a separate Terraform reasoner layer, AgentCore HTTP runtime, Strands/Bedrock assessments, deterministic policy and atomic virtual execution. Phase 5 adds a separate JWT MCP runtime behind an API proxy, nine tools backed by a private Lambda and the actual browser MCP client. Both paths share household records and the deterministic executor. The existing diagram remains unchanged. See [Phase 4](phase-4.md) and [Phase 5](alexa-mcp.md) for boundaries, deployment prerequisites and deferred acceptance checks.
