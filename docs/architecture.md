# Architecture Status

The implementation target is an evidence-first vertical slice: web simulator and command center -> Aenea application/MCP tools -> IncidentBridge normalization -> incident timeline and deterministic policy -> virtual actions, with Strands + Bedrock hosted on AgentCore Runtime and DynamoDB persistence.

The [final architecture diagram](architecture/01_aenea_architecture_overview_final.png) is the unchanged v1 design baseline selected for implementation. Its Ring/vendor labels denote simulated source/action categories in the Alexa+ demo, not working vendor integrations. The text documentation and verified deployed configuration govern implementation details.

Camera/doorbell, sensor, weather, household and device events are synthetic and visibly labeled. They still enter the real hosted backend through HTTP. No Ring API, official Ring simulator, Ring credentials, physical Alexa or physical IoT device is required.

Phases 2–3 infrastructure and web deployment succeeded on 17 September 2026. Phase 4 source adds a separate Terraform reasoner layer, AgentCore HTTP runtime, Strands/Bedrock assessments, deterministic policy and atomic virtual execution. The existing diagram remains unchanged. See [Phase 4](phase-4.md) for boundaries and deferred acceptance checks. MCP coordination remains Phase 5.
