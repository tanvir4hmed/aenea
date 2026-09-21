# Phase 4: reasoner and safety

Source implementation prepared on 17 September and finalized on 21 September 2026. Cloud build/deployment is delegated to GitHub Actions. Runtime acceptance testing remains deferred by project-owner instruction; this document does not claim a successful model invocation or end-to-end demo.

Rollout prerequisite (21 September): the local administrator AWS login expired before the Phase 4 deployment-role policies could be synchronized. Refresh that login and apply the updated bootstrap permissions before rerunning a failed Phase 4 deployment. GitHub's normal deployment still uses OIDC.

## Implemented path

EventBridge → Step Functions → correlate → invoke_reasoner → IAM-authenticated AgentCore HTTP runtime → Strands / Bedrock → strict assessment validation → policy → action_executor.

Terraform owns the reasoner runtime in its own `reasoner/terraform.tfstate` layer. GitHub builds a Python 3.12 ARM64 ZIP and uploads it to a private code bucket; no container, CloudFormation, local application runtime or physical device is needed. AWS provider 6.65.0 is selected for app and reasoner resources.

The default model is `amazon.nova-lite-v1:0`. AWS read-only availability checks returned AUTHORIZED, AVAILABLE and ACTIVE in us-east-1 on 17 September. This is not inference-test evidence. Override the Terraform `bedrock_model_id` input for another supported Amazon Nova foundation model; changing provider or inference-profile format requires an explicit IAM update.

## Safety and persistence

- Model output cannot change devices, settings, confirmation, or authorization. AgentCore's role has no DynamoDB write or device execution permission.
- All settings come from a household-scoped authenticated profile. Automatic actions default to not preauthorized.
- Only four virtual capabilities exist: lights, siren, in-app notification and valve. Notification means a recorded app notification, not SMS, SNS delivery or emergency dispatch.
- A model proposal must cite known events. Policy checks actual event kinds, not the model's claimed type or confidence. Camera-only context cannot authorize an action.
- Evidence must be simulated and at most 15 minutes old, with no future timestamp. Policy refuses an incident whose evidence exceeds the 200-event/one-page budget; the model receives at most 20 events.
- Proposals expire after five minutes. Valve closure requires an authenticated explicit confirmation, cited water-leak evidence, and no fresh smoke/CO evidence anywhere in the incident.
- Policy is re-evaluated immediately before execution. The transaction checks both household configuration revision and incident evidence count to prevent changes between the read and write.
- Device state, action result and audit record commit in one DynamoDB transaction. Replays do not apply a completed virtual command twice. A completed/failed command is not reissued for the same device/action in that incident.
- Simulated failure records an alternate coordination plan and consumes the configured failure flag. It never reports physical execution or invents a successful fallback.
- Model/service/schema failure records `assessment_failed`; no model result is fabricated and no actions follow. A fresh signal requests another assessment.

## Browser and API usage

1. Sign in and open Simulation lab.
2. Expand virtual household settings, explicitly authorize desired automatic virtual actions, and save.
3. Send a fresh smoke signal; inspect assessment, evidence references and policy/action results in the shared timeline.
4. Use a new water-leak incident to exercise explicit valve confirmation.
5. Configure “fail next” on a virtual device, save, and start a new incident to inspect failure and alternate plan.

These steps are the deferred acceptance procedure, not a claim they have passed.

| Endpoint | Scope | Meaning |
|---|---|---|
| GET /household/devices | aenea/read | Saved virtual household permissions |
| PUT /household/devices | aenea/write | Replace virtual permissions/failure settings |
| POST /incidents/{incident_id}/actions/{action_id}/confirm | aenea/write | Confirm an existing pending action with `{"confirm": true}` |
| GET /incidents/{incident_id}/timeline | aenea/read | Evidence, immutable assessments/audits and current action records |

Settings body: `{"devices":{"virtual_lights":{"enabled":true,"preauthorized":true,"fail_next":false}}}`. Supported IDs: virtual_lights, virtual_siren, virtual_notification, virtual_valve. Omitted devices are disabled. The server always assigns simulated provenance.

Timeline records are key-paginated; load all pages when reviewing an incident. `recorded_at` is the audit time, while source evidence retains its original `occurred_at`. Model confidence is not a calibrated emergency probability.

## Deployment and remaining verification

- `agent/reasoner/**` or `infra/reasoner/**`: package/apply only reasoner.
- Shared assessment contract: reasoner plus Lambda packages.
- Individual Lambda: only that package; workflow-only edits update the state machine.
- App infrastructure: package required functions and apply app.
- Web changes: build/publish web. A backend/agent change alone does not build web.
- First Phase 4 rollout also updates API CORS for PUT and attaches the new invocation permissions.

The deployment role's bootstrap template includes AgentCore lifecycle permissions and PassRole for the AgentCore service. Keep that template in sync with the live managed policy using the one-time AWS administrator/bootstrap path.

Deferred verification: model/schema failures, cross-household confirmation denial, duplicate/concurrent execution, expired confirmations, changing permissions during execution, smoke blocking valve actions, ARM64 runtime cold start and full hosted scenario. Pure policy regression cases are in `tests/test_safety.py`; run later with `python -m unittest discover -s tests`.

Phase 5 source is now documented in [Alexa+/MCP](alexa-mcp.md); runtime acceptance remains deferred for both phases.
