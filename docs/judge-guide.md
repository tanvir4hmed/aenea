# Aenea judge guide

Open [Aenea](https://aenea.qleam.com). The public [guide](https://aenea.qleam.com/guide) does not require sign-in. The welcome screen provides shared guest credentials with reveal/copy controls. **Open guest sign in** opens Cognito; paste the credentials there. The owner must verify access against the final deployed commit before submission.

Guest data is shared. Use synthetic names/addresses/observations and do not delete another visitor's records.

1. **Settings → Add device:** create a fictional location inline and two smoke detectors in a room. The location is reused for subsequent devices. Device list supports editing and deletion. All input devices are simulated.
2. **Simulation Studio:** save a single alert and a multi-device scenario. Set on-change or repeat, interval, duration and optional clear. Saving does not send. Scenarios may reuse devices from other saved definitions.
3. **Command Center:** select a saved definition (or click its mapped device), leave assignment Automatic and Send. Multiple selections work when their devices do not overlap; the warning names overlapping definitions. Scheduled does not mean published: inspect the cloud run's progress, then the named incident.
4. **Alexa+:** observe live device/room context and the actual saved assessment. Enable browser spoken updates if desired. Ask about reporting devices, changes or assessment freshness in the adjacent Ask Alexa+ panel. Select an active signal to highlight its device on the map. Response controls and context entry are retired.
5. **Sequential evidence:** reuse a definition or let an active repeat profile continue. Related alerts join the incident and changed context supersedes old approvals. Repeated identical reports are not independent detectors. Cloud generation does not require the page to remain open.
6. **History and Resolve:** inspect citations, uncertainties, notes and review records. Explicitly resolve when finished. A fresh trigger gets new incident activity and a fresh allowance. Stop is different: it cancels generation but does not clear alarms or certify safety.

For a separate water-only test, register a water-leak sensor and send its saved definition. Unrelated hazard families remain separate incidents. No device-response execution or physical actuation is enabled.

Run pause/resume preserves pending identities. Per-incident simulation allowance starts at 2,000 and can be extended deliberately up to 10,000; quota exhaustion is not resolution. Catalog/library/run capacities and scheduling delays are documented in [state-driven coordination](state-driven-coordination.md).

Delete only your test incident via Settings → Data & cleanup with exact confirmation. Cleanup is eligible after 15 minutes; inspect its status later. Only completed means the active database/evidence-version purge finished; minimal replay markers and separately retained backups/logs remain.

Hosted runtime, login, microphone and deployment acceptance are separate from [offline source checks](source-verification.md). Aenea has no native Alexa/Ring integration, people registry, emergency dispatch or monitoring service. Follow official alarms and emergency guidance.
