# Incident usability follow-up — 2 October 2026

> Historical iterations below. The [device-first experience](device-first-experience.md) supersedes response permissions, separate Ask views and optional context entry.

## Requested corrections

Live assistance has two views: **Overview** for the current briefing, active signals and response decisions, and **Ask Alexa+** for questions and optional context. **Command Center** is a separate navigation entry for the device map and practice runs. Incident history retains evidence, assessment review and recorded outcomes; it links to Live assistance for response decisions.

Questions use the existing bounded intent model call to select the question topic. The application renders a short answer from stored incident facts. Occupancy questions state that occupancy is unconfirmed; motion cannot prove who is inside. Reporting-device questions use readable names and distinguish reported, cleared and unknown states. The model cannot turn a question into device approval.

Microphone recognition submits the final question once. Spoken questions are read-only; device approvals still require the explicit response controls. Recent answers are stored with timestamps in this browser, scoped to the signed-in household and selected incident, and survive navigation and reload. They are historical replies rather than continuously updated assessments. Sign-out and explicit browser-history clearing remove them.

Registered sensor inputs and response outputs have different jobs. Settings explains this distinction, links an empty response list to device setup, and only offers a meaningful permissions save when outputs exist and changes have been made. Permissions do not connect physical devices. Historical generic output proposals remain inspectable but do not occupy the primary response queue as though they were installed devices.

Older evidence sometimes has no trusted device/location snapshot. Display can use a matching current catalog name, with a historical-context explanation; it must never rewrite the old evidence, infer historical room assignments, or substitute catalog metadata for action authorization. Missing names use readable signal labels rather than raw identifiers.

The practice signal limit can be increased for an older open incident without a stored counter. Extension sets an absolute limit, preserves used reservations, and supports retrying the same target without incrementing twice or lowering a newer limit. The interface explains the practice-only scope and the separate step to resume paused runs.

## Verification boundaries

Regression tests and the local browser fixture exercise the source implementation. Fixture answers are explicitly labelled and are not hosted model results. A GitHub deployment result and authenticated hosted acceptance are distinct checks.

First-pass checks: 166 Python tests and 46 JavaScript tests passed, along with correctness lint, Python formatting/selected strict typing and the production frontend build. The local fixture verified the separate Ask view, a concise occupancy answer, conversation retention after reload, and no horizontal overflow at the mobile breakpoint. Actual microphone service and authenticated hosted behavior were not exercised. Deployment is left to the normal push workflow; no deployment wait was requested.

## Second pass: incident-first loading and clarity

Live assistance, Command Center and Incident history now share the selected incident's current view without clearing it on every page change. Live status polling excludes the general timeline page; evidence and historical decisions load only when requested and preserve additional pages independently. This removes one general DynamoDB page query and its response payload from each status refresh. Historical pagination skips current-state reconstruction entirely. Existing clients can still request the combined API response.

Current-state reads retain the existing evidence cache with revision checks; a cold evidence scan may still take time on large incidents. No policy or execution checks are bypassed. Responses from older requests or a previous selection/session are discarded, and post-mutation refreshes do not share reads started before the mutation. An old evidence page cannot make the live state look freshly received. Cached views are explicitly non-authoritative; failed refreshes show a retry option and disable response approval. Live confirmation also stops when the last received status is over 30 seconds old. Status receipt time and latest reported signal time are displayed separately, without suggesting that either proves safety.

Command Center map/management code now loads on demand, with a separate loading boundary so its hidden persistent composer cannot hide Live assistance. The production entry JavaScript decreased from 285.11 kB (90.05 kB gzip) to 273.34 kB (86.55 kB gzip); this is a bundle measurement, not a hosted latency claim. Recorded evidence uses readable source labels, and browser cleanup explicitly names conversation history alongside simulation drafts. Late permission-save results cannot overwrite a newer inventory view.

Second-pass verification is intentionally focused: seven API-view tests and fourteen request/cache/history/live-assistance JavaScript checks passed, along with changed-Python lint/format checks, frontend lint and a production build. A short local browser check confirmed the overview layout with no reported console warnings/errors. No broad regression rerun or deployment wait is part of this pass.
