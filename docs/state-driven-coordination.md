# State-driven incident coordination

Current behavior is documented in [the user guide](user-guide.md), [Maple House handover](maple-house-handover.md), [automatic incidents](automatic-incidents.md), and [MCP](alexa-mcp.md).

Simulation Studio saves definitions. Command Center starts durable cloud runs that publish through authenticated ingestion. Source identities, state, location and retry receipts are validated before evidence is recorded. Automatic assignment creates or joins a compatible location/hazard incident; a model supplies constrained names/explanations, with deterministic fallback.

Changed evidence receives a revision-checked AgentCore assessment. Unchanged repeats can reuse a valid assessment. The model sees bounded context while all accepted evidence remains stored. Backend severity and persisted briefings feed the map and Alexa+ view. Resolving an incident cancels associated simulation generation; stopping a run does not clear a sensor or resolve an incident.

Device-action generation, policy/execution code, response permissions and action MCP tools are removed. Historical action and person records remain readable in History. No new member reporting, calling or native Alexa/device integration is provided. The management Lambda retains its existing resource name to preserve working Settings, lifecycle and simulation API integrations.
