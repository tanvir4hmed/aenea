# Release gates — not yet cleared

Updated 24 September 2026. Phase 9 completes release preparation, not live acceptance, a video or a Devpost submission.

## Prepared

- [x] Current README, unchanged architecture baseline, license and third-party notices.
- [x] Nine workspace phases documented, including revisions, decision review and cleanup.
- [x] Offline checks recorded separately from hosted evidence.
- [x] Judge instructions, timed narrative, submission draft and feedback inventory.
- [x] Aenea and IncidentBridge public visibility checked; IncidentBridge Apache-2.0 license and pinned contribution date checked.

## Deployment and access — authorized verification still needed

- [ ] Reconcile the current bootstrap deployment policy with an authorized AWS administrator session. The Phase 8 scheduled cleanup requires the exact default-bus rule ARN for `aenea-cleanup`; an older live role may lack it. See [operations](operations.md).
- [ ] Record the successful final-code pipeline run, deployed commit and DNS/TLS result. A push or workflow trigger alone is not proof.
- [ ] Verify Cognito PKCE sign-in, access-token refresh, MCP discovery and every tool. Verify wrong-client, ID-token, expired-token and insufficient-scope rejection.
- [ ] Verify the shared guest sign-in from a clean browser. Public guest credentials are intentionally displayed by the application; they are not private tenant credentials. Use fictional data only.
- [ ] Confirm owner account isolation from guest and another account, including forged IDs/cursors.
- [ ] Verify billing alerts, OIDC/environment restrictions, ingress pause/resume and dependency review.

## Product acceptance

- [ ] Fresh-clone dependency installation and offline checks; retain logs with the commit. Existing local results are not a clean-install guarantee.
- [ ] Catalog edits/conflicts, duplicate devices, selected one-at-a-time sends, stable uncertain retries and new-incident replay.
- [ ] Hosted signal → evidence → model assessment → policy → saved virtual outcome.
- [ ] Later evidence supersedes an old assessment; out-of-order model completions cannot replace the current revision.
- [ ] Rejection blocks future actions; agreement does not approve them. Confirmation is tied to the exact assessment, expires, and cannot cross revisions.
- [ ] Duplicate/concurrent ingress, reviews, acknowledgments and check-ins; failures and partial handoffs remain visible.
- [ ] Evidence budget failure beyond 20 signals is explicit, not a silently incomplete assessment.
- [ ] Authorized incident deletion: hidden immediately, drain at least 15 minutes, scheduled retry, all S3 evidence versions and active incident records removed; unrelated data retained.
- [ ] Keyboard/mobile/browser-speech fallback, clipboard/print and understandable errors. No WCAG certification is asserted.

Do not perform destructive acceptance on another visitor's records. The public guest is a shared identity; its data is not private. Cleanup retains a minimal replay-blocking marker; backups, workflow history, exported copies and logs have separate retention.

## Submission assets and owner decisions

- [ ] Recheck [official rules](https://amazonappdev2026.devpost.com/rules) on submission day; owner confirms eligibility, rights and team representation.
- [ ] Record and publish the actual English demo; insert its URL into the draft.
- [ ] Complete observed task/onboarding/strengths/problems/reuse feedback for every tool used. Include AWS integration details.
- [ ] Confirm optional Open Source entry links and what/how/why description against the final pinned contribution.
- [ ] Include working testing instructions and current login credentials where needed in the entry; maintain free judge access for the required period.
- [ ] Owner reviews and submits the final Devpost entry. No submission was made by this phase.

The source plan ends at Phase 9. Remaining items are release/verification gates, not an implied extra coding phase.
