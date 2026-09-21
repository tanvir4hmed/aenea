# Release gate — not yet cleared

Updated 21 September 2026. Phase 7 source hardening and submission preparation are complete; runtime/security acceptance, video and final submission are not. An unchecked item must not be presented as passed.

## Implementation prepared

- [x] Apache-2.0 license, source, architecture baseline, notices and cloud instructions.
- [x] MCP runtime/client, simulation, policy executor, household/handoff source.
- [x] Stable check-in retries, atomic acknowledgment audit and bounded tenant-bound cursors.
- [x] Operator ingress pause and cost/security limitations documented.
- [x] Pure regression source and release/demo procedures prepared (not executed).
- [x] Devpost draft, mini-challenge references and feedback inventory prepared.

## Account and deployment

- [ ] Refresh administrator login and reconcile Phase 4–7 IAM templates in the intended AWS account.
- [ ] Record a successful pipeline commit/run for the final build; no hidden local-state dependency.
- [ ] Confirm DNS/TLS at `https://aenea.qleam.com`, Cognito demo user and resource-bound login.
- [ ] Set an owner-approved billing budget/recipient; verify notifications and ingress pause/resume.
- [ ] Verify exact GitHub OIDC subject/environment protection and public repository/license visibility.

## Authorized verification session (deferred)

Use a separate fresh cloud workspace, not the development directory. Install Git, Python 3.12, Node 22, Terraform 1.14 and AWS CLI, clone the public source and follow the bootstrap/deployment guide. In an existing account, read/import existing state correctly; never create an independent state stack over live resources. In a new account, review the fixed GitHub trust and domain defaults before provisioning. This is an owner-operated deployment recipe, not a self-service judge install into an arbitrary account.

- [ ] Fresh-clone dependency installation/build and offline regressions: install `functions/requirements.txt` in an isolated Python environment, then `python -m unittest discover -s tests`. Persistence tests mock AWS; no real household credentials/data are required. Preserve logs and commit ID.
- [ ] Capture/review dependency lockfiles from the runner; current dependency ranges are not fully reproducible locks. No vulnerability-free claim is made.
- [ ] Signed-in MCP initialize/tools discovery and each tool; reject wrong audience, ID token, expired token and missing write scope.
- [ ] Two-household isolation, forged/malformed cursors and inaccessible incident/action IDs.
- [ ] Same check-in request ID replay, conflicting payload, concurrent retry and late retry after a newer report; original response must not roll back the newer report.
- [ ] Concurrent acknowledgment produces one audit and persistent acknowledgment.
- [ ] Duplicate ingress, stale/future evidence, model/schema failure, action expiry, smoke/CO valve exclusion, concurrent permission edits and virtual failure.
- [ ] SDK timeout/read-before-retry behavior and paginated/partial handoff behavior.
- [ ] Keyboard/mobile layout, microphone fallback, clipboard fallback and print safety wording.
- [ ] Clean browser access as a judge; provide restricted synthetic demo credentials privately, never in Git.

## Submission gate

- [ ] Re-read current [rules](https://amazonappdev2026.devpost.com/rules) and [overview](https://amazonappdev2026.devpost.com/) on submission day; verify team eligibility personally.
- [ ] Actual hosted English demo repeatedly rehearsed under three minutes, uploaded publicly to YouTube/Vimeo, reviewed logged out.
- [ ] Replace missing video/runtime-evidence/judge-access fields in the draft; claims match the actual recording.
- [ ] Complete experiential feedback for every used service/SDK; pending observations are not final feedback.
- [ ] Verify optional IncidentBridge contribution URL, license, dates, username and what/how/why text.
- [ ] Confirm service availability/free judge access through the required judging period.
- [ ] Owner approves and submits the final Devpost entry. No submission has been made by this work.

No Phase 8 is planned. Remaining work is these explicit release gates, not another completed coding phase.
