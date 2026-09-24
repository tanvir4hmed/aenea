# Demo runbook — target 2:50

Updated 24 September 2026. **Planned, not rehearsed or recorded.** Keep the Alexa+ coordination story central. Show genuine saved results; never replace a failed request with fabricated responses.

## Prepare

1. Clear the account/deployment gates in the [release checklist](release-checklist.md), then verify sign-in and MCP.
2. In Settings create a fictional location with a smoke detector and camera. Configure only the virtual permissions intended for the recording.
3. In Simulation Studio queue smoke and camera motion; select both. Start a new run but send only the first selected signal.
4. Rehearse waiting for the saved assessment, adding the second signal to that same incident, and inspecting the new revision. Receipt acceptance is not assessment completion.
5. Use synthetic names. An absent report stays unknown. Do not expose private credentials, tokens or account details.
6. Verify actual action proposals beforehand: model output varies. Never narrate an action that was not proposed/executed.
7. Prepare source and redacted runtime evidence only after capturing them. Keep inputs fresh and stay below the 20-signal assessment budget.

## Recording

| Time | Show | English narration cue |
| --- | --- | --- |
| 0:00–0:15 | Dashboard, simulation labels | “Aenea brings separate alerts, household reports and permitted responses into one incident.” |
| 0:15–0:35 | Studio: Send next selected signal; saved smoke assessment | “The smoke signal is synthetic; the cloud processing and saved evidence are real.” |
| 0:35–1:05 | Alexa+ status and synthetic check-in | “This Alexa experience uses MCP to read and update the same incident. A check-in is a self-report, not verified safety.” |
| 1:05–1:30 | Studio: send the next camera signal; updated revision | “New evidence can arrive later. The old assessment no longer authorizes new actions. Motion does not identify a person.” |
| 1:30–1:55 | Decision review, citations, policy and actual action state | “The agent proposes; policy checks. We can inspect evidence and reject a decision. Human agreement does not bypass action approval.” |
| 1:55–2:20 | Alexa: Prepare a handoff | “A reviewable snapshot shows evidence, unknowns and saved outcomes. It is not an emergency dispatch.” |
| 2:20–2:43 | Actual runtime evidence and source | “AgentCore hosts MCP and the Strands/Bedrock reasoner. IncidentBridge normalizes events; deterministic execution keeps effects virtual.” |
| 2:43–2:50 | Incident context | “Shared context and accountable coordination—not a replacement for alarms or emergency services.” |

Use concise cuts for genuine waiting; keep the input-to-result relationship and incident identity intact. If a result is missing, fix/rehearse before recording or state the limitation. Do not splice unrelated incident outcomes into one run.

## Supplementary acceptance, not required in the short story

- Water-only scenario with a fresh assessment-bound explicit valve approval; no smoke/CO conflict.
- Rejected/stale proposal refusal and a genuine saved virtual failure if proposed.
- Guarded cleanup after its drain/scheduler delay; it cannot be demonstrated end-to-end in three minutes.
- Partial handoff, speech/clipboard fallback, retries and cross-account isolation.

## Evidence record

After rehearsal record commit, deployment run, date, incident IDs, actual outcomes, redacted trace reference, video URL and measured duration. Use the [judge guide](judge-guide.md) for clean-browser replay. No publication or successful rehearsal is asserted by this document.
