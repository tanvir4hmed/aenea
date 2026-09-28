# Engineering baseline

Baseline established 28 September 2026. This document describes source coverage, not hosted acceptance or safety certification. No UI layout, event schema, incident routing, AWS resource or model behavior changes are part of this baseline.

## Feature protection inventory

| Existing path | Source and offline coverage | Remaining verification |
| --- | --- | --- |
| Sign-in, refresh and authenticated workspace | `auth.js`, `mcp.js`, `main.jsx`; frontend lint/build | Expiry, refresh races, resource audience, hosted callback and MCP session recovery |
| Locations/devices and permissions | `Settings.jsx`, `catalog.py`; `test_catalog.py` | Keyboard/mobile CRUD, ownership and action-target integration |
| Single/scenario definition library | `SimulationStudio.jsx`, `simulation_library.py`; library and JS simulation tests | Browser filters, pagination, unsaved edits, future state profiles |
| Map selection and combined triggering | `DeviceMap.jsx`, `simulations.js`, `signalQueue.js`; command-center, simulation and alert-flow JS tests | Responsive visual baseline; future automatic assignment and named overlap messages |
| Ingestion, retries and correlation | `ingest`, `correlate`, `revisions.py`; safety/revision tests and IncidentBridge contract tests | Concurrent ingestion, model outage and lifecycle integration |
| Assessment, policy, actions and review | `shared/assessment.py`, reasoner, policy/executor, `decision_review.py`; safety/review/revision tests | Real runtime responses, stale approvals and account-level IAM |
| Alexa, household reports and handoff | `AlexaSimulator.jsx`, `Household.jsx`, `Handoff.jsx`; Alexa JS and household retry tests | Live conversation and protocol failures; retain legacy records during future consolidation |
| History and guarded deletion | `incident_api`, `cleanup`, cursors/lifecycle; cleanup/cursor/query tests | Large datasets, retries, eventual storage deletion and hosted status |
| Deployment isolation | `scripts/deploy_scope.py`; `test_deploy_scope.py` | Actual CI execution is separate from offline selection tests |

## Contracts, storage and resources

- IncidentBridge owns the versioned `IncidentEvent` schema, normalization, provenance, idempotency and CLI. Aenea still consumes a fixed upstream commit; changing the library does not automatically upgrade Aenea.
- Catalog, simulation library, incident metadata/evidence revisions, decisions, historical reports and deletion jobs persist through the DynamoDB-backed functions. Evidence also uses private versioned S3. Contract changes need compatibility tests and explicit migration; the baseline does not alter data.
- `bootstrap`: retained state bucket and deployment-role policies. `tls`: certificate. `data`: state/evidence. `platform`: web hosting, identity, API and event infrastructure. `app`: functions, workflow, integrations and cleanup. `reasoner` and `mcp`: separate AgentCore packages/runtimes. Each layer has separate remote state; see [deployment](deployment.md).
- Deployment selection is now a side-effect-free module. Web-only changes build the web; individual function directories update that function; shared Python dependencies rebuild consumers; platform/data changes refresh app wiring; platform refreshes web configuration and MCP. Existing dispatch behavior is retained and tested.

## Quality gates and dependency boundaries

The [contribution guide](../CONTRIBUTING.md) supplies the exact commands. Python 3.12 is the local/CI baseline. Aenea uses whole-repo correctness lint, strict types and formatting for the newly extracted deployment selector, Python unit tests, JavaScript behavioral tests, frontend ESLint and production build. This is incremental adoption, not full-codebase type/format completion. CI has read-only repository permissions and requires no cloud credentials.

The npm lockfile is committed and deployment uses `npm ci`, which refuses manifest/lock mismatch. Direct Python check dependencies are pinned; full runtime/transitive locking, dependency update policy and provider-lock coverage remain backlog items. Do not upgrade runtime libraries incidentally during a UI or domain refactor.

IncidentBridge independently checks Ruff lint/format, strict typing, schema/CLI tests, wheel/sdist build and clean-wheel CLI/schema behavior. Its CI retains Python 3.11–3.13; a local Python 3.12 run does not claim all matrix jobs passed.

## Incremental refactor backlog

The event/auth foundation now adds trusted ingress context, read compatibility for legacy evidence, resource-bound JWT enforcement and transport/session regression coverage; see [contract and migration](event-contract.md). Strict type checks now also cover the new event-contract and JWT modules. Automatic routing/state aggregation and hosted acceptance are still pending.

Local baseline results: Aenea 72 Python tests (including 12 deployment-selection regressions), 20 JavaScript tests, Ruff correctness/selected-format checks, selector strict typing, ESLint and Vite build passed. IncidentBridge 35 tests, lint/format, strict typing, wheel/sdist build and clean-wheel validate/emit/replay/schema comparison passed. Checks used Python 3.12 and local Node 24; CI targets Node 22. No hosted acceptance or deployment-result verification was performed.

| Module area | Required follow-up |
| --- | --- |
| Event contracts and MCP/auth | Trusted catalog enrichment, explicit versioning/state semantics, protocol/auth regression fixtures |
| Incident engine and history | Atomic assignment/lifecycle, paged evidence, bounded model context without dropping future events |
| Simulation | Shared validated profiles, server scheduling, visible limits and capacity model; preserve current Studio/Command Center layout |
| Actions and Alexa | Location-scoped capabilities, persisted briefings, material-update deduplication; retain historical data when retiring pages |
| Frontend | Decompose state-heavy views, accessible form/status feedback, React-aware unused-symbol/hooks checks, targeted formatter adoption |
| Backend and tools | Expand strict types/formatting module by module; structured errors, mocks for transport/storage boundaries |
| Infrastructure/release | Provider/runtime lock audit, selective deployment integration, resource cleanup/IAM tests, accessibility and hosted regression evidence |

Members and emergency calling are outside the active scope. The application remains a simulated coordination prototype. Future features above are not represented as implemented.
