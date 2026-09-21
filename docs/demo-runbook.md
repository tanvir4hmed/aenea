# Aenea demo runbook — target 2:50

Prepared 21 September 2026. **Not yet rehearsed or recorded.** This is the planned English narrative; use only behavior actually observed in the deployed build. Do not replace failed/missing results with fabricated overlays.

The [challenge overview](https://amazonappdev2026.devpost.com/) and [official rules](https://amazonappdev2026.devpost.com/rules) require a working demonstration with the submitted source. Prepare a public English YouTube/Vimeo video under three minutes. Clearly label the Alexa experience and device inputs as simulations. Do not include unlicensed music, footage or third-party branding. Submission-day verification remains Phase 7.

## Before recording (deferred hosted work)

1. Synchronize Phase 4–5 IAM permissions with a refreshed AWS administrator login, complete pipeline rollout and confirm the signed-in web/MCP path works. Do not show credentials or access tokens in a recording.
2. In Simulation lab, expand virtual permissions: enable virtual lights/siren and explicitly preauthorize the automatic simulated commands desired for this scenario. Enable `fail_next` on virtual lights, then save. Enable notification only if it will be shown as an in-app record. Nothing is delivered to a phone or responder.
3. Choose **Smoke + camera context**. Start a fresh incident. Wait for the first actual assessment before sending the second signal, then inspect the updated saved assessment. Scenario receipts prove ingress acceptance, not model/action success.
4. Verify a genuine eligible action failure and alternate coordination plan exist. Model proposals vary: if the lights action was not proposed, the failure flag has not been exercised. Adjust the scenario/recording after review; never claim a failure test passed without its saved record.
5. Use fictional names only. Check-in controls can explicitly save `unknown` for Resident B; lack of a full household roster never means everyone is safe. Report Resident A only when narrating that synthetic self-report.
6. Prepare a separate **Water leak + explicit approval** incident for supplementary verification. Do not mix valve closure into the smoke demonstration. Pending proposals expire after five minutes; an old proposal is not a valid fresh recording.
7. Open the source/IncidentBridge reference and a real redacted runtime trace only after those artifacts actually exist. Clear unrelated sensitive tabs. Keep all inputs fresh for the 15-minute evidence window.

## Proposed 2:50 English narration

| Time | Screen/action | Narration cue |
|---|---|---|
| 0:00–0:15 | Command center and simulation labels | “Separate alarms tell a household different things. Aenea brings signals, check-ins and permitted responses into one auditable incident.” |
| 0:15–0:35 | Send smoke, then camera context using scenario cards | “These inputs are synthetic. They enter our real hosted backend. Camera motion is context—not proof that someone is inside or safe.” |
| 0:35–0:55 | Saved assessment/evidence | “The agent assesses the evidence and records uncertainty. A deterministic policy, not the model alone, controls every virtual action.” |
| 0:55–1:20 | Alexa+ web simulation, status command and Resident A check-in | “This labeled Alexa experience calls our MCP server. Its report and check-in use the same incident state as the rest of the app.” |
| 1:20–1:40 | Household page, refresh reports | “Resident A has self-reported. Resident B is unknown. Missing information is never converted into an all-clear.” |
| 1:40–2:00 | Recorded virtual failure/alternate plan | “This virtual device failed. Aenea records that failure and an alternate coordination step; it does not pretend the device worked.” |
| 2:00–2:25 | Prepare Handoff | “Here is the saved evidence, uncertainty, household reports and action outcomes. This is a reviewable synthetic handoff, not an emergency dispatch.” |
| 2:25–2:43 | Actual MCP/source/runtime evidence and IncidentBridge | “The shared tools run on AgentCore with Cognito authorization. Strands and Bedrock assess normalized IncidentBridge events; policy gates execution.” |
| 2:43–2:50 | Incident view | “One incident, shared household context, and accountable coordination. A prototype—not a replacement for alarms or emergency services.” |

For the optional Open Source mini, show the additional IncidentBridge contribution and use its verified URL. AWS Builder evidence must demonstrate the implemented integrations, not just logos. These are planned entries; no submission or video publication is performed in Phase 6.

## If a prerequisite fails

- MCP/auth unavailable: do not substitute browser-local fake responses. Resolve onboarding/deployment before recording.
- Assessment fails: show that recorded failure when relevant; do not narrate an absent assessment or action.
- Device failure not proposed/executed: do not claim the flag itself proves execution. Use a later real run after review.
- Handoff is partial: keep the warning visible and review remaining timeline/household pages. Do not describe it as exhaustive.
- Write times out: read saved state before retrying. Ingestion scenario retries reuse the identical payload.
- Timing exceeds three minutes: trim narration and idle footage transparently, retaining the actual input-to-result connection. Never splice different incident results as though they were one run.

## Evidence record (fill only after running)

Record date, source commit, hosted URL, incident IDs, scenario settings, observed outcomes, runtime trace reference, measured video length and any deviation. Do not put passwords, tokens or real household details in the public repository. No completed rehearsal or recording is asserted yet.
