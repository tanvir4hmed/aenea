# Incident usability follow-up — 2 October 2026

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
