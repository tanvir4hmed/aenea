# Alexa+ page controls

This page is a browser simulation, not a native Alexa integration. Cloud assessment continues without the page; browser speech requires the page to remain open.

| Control / display | Data and behaviour | User action |
| --- | --- | --- |
| Incident | Loaded incidents by name; all content follows this selection | Choose the incident to review |
| Live / Updates delayed | Age of the last received incident update | Refresh now if delayed; do not interpret stale data as current safety |
| Briefing and severity | Current saved briefing, or a fallback while assessment catches up | Normally read or listen; no command is required to start assessment |
| Device chips | Active devices, rooms and signal kinds in the selected incident | Informational |
| Replay briefing | Reads the displayed briefing using browser speech | Click to hear it once |
| Enable / Mute spoken updates | Speaks changed current briefings; ordinary updates are throttled | Enable once on the page; mute when unwanted |
| Refresh now | Reloads the selected incident | Optional manual refresh |
| Command + Ask | Supported status, timeline or acknowledgement request; unsupported requests are explained | Type and send; this is not unrestricted action control |
| Use / Stop microphone | English browser transcription fills the command field | Review the text, then Ask |
| What is happening? | Latest assessment, currency and uncertainties | Optional status shortcut |
| Show the timeline | Reports loaded record count; full evidence is in History | Optional history shortcut |
| Acknowledge incident | Records acknowledgement | Does not resolve the incident or establish safety |
| Conversation | Last 20 replies from this page session | Clears when switching incident |
| Coordinated actions | Agent proposals, policy status and recorded outcomes for configured outputs | Empty when there are no action records; configure outputs in Settings |
| Confirm action | Only pending, current, unexpired proposals are eligible | Explicitly approve only the displayed action |
| Read outcome | Fetches the saved action result | Check before retrying an action |
| Optional incident note + Save note | Saves additional unverified context and requests reassessment; disabled for resolved incidents | Optional; never required during an incident |

Setup: Settings → locations, input devices and output permissions. Define simulations in Studio, trigger them in Command Center, then observe this page. Resolve explicitly in incident controls after review; acknowledgement is separate.
