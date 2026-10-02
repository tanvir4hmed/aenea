# Incident-first interface

Alexa+ assistance is the default signed-in landing view. Live assistance has two views: Overview for briefings and response decisions, and Ask Alexa+ for questions and optional context. Command Center has its own navigation entry for the map and practice runs. See the [2 October usability follow-up](usability.md).

## Information priorities

1. Incident name, location, severity and current briefing.
2. Eligible confirmations and recorded action outcomes; stale proposals cannot be approved.
3. Active device reports and affected rooms.
4. Optional questions and additional context, not mandatory incident paperwork.

History retains decision reviews, evidence, resolution, rename, deletion and read-only action outcomes. Simulation Studio retains create/saved definitions; only Command Center triggers them. Settings groups locations, devices, response permissions and cleanup. On small screens Live, Map, History and Settings remain reachable from bottom navigation.

Response permissions apply to configured virtual outputs. Non-valve outputs must be enabled and pre-authorized for automatic action. Enabled valves still require explicit approval and policy checks. These controls do not connect physical devices.

## Engineering and verification

The separate interface experiment uses `experience.css` and an extracted incident-note component. Its commit can be reverted without reverting the preceding performance/settings fixes. Draft note request identities survive a retry; incident changes prevent an old completion from updating the new incident's form.

Offline acceptance: 39 JavaScript tests and 144 Python tests passed; frontend lint and production build passed. Local browser fixture checked desktop layout, 390px mobile layout without horizontal overflow, navigation, compact Settings fields and note save. Fixture data is explicitly labelled and is not an agent outcome or hosted acceptance test.

Initial JavaScript is approximately 281 kB uncompressed after redesign, versus 332 kB before the performance pass. This is a bundle measurement, not measured hosted latency. Warm evidence snapshots and in-flight request sharing reduce repeated work; fresh authorization and current action checks remain necessary.

## Boundaries

This is a simulated incident-coordination prototype, not a certified alarm or emergency service. Browser speech requires an open page. Native Alexa integration, real device control, emergency calling and production multi-tenant readiness are not implied by this design. The previously reported hosted MCP 401 still needs authenticated hosted diagnosis; a successful UI fixture does not resolve it. Deployment verification remains separate from source checks.
