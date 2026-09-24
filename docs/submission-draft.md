# Aenea — submission draft, not submitted

Updated 24 September 2026. Release acceptance is [still open](release-checklist.md). Review these claims against the actual recording before submitting.

**Tagline:** Shared household context, accountable incident coordination.

**Primary:** Alexa+ alternate experience simulation.

**Proposed minis:** AWS Builder and the separate IncidentBridge Open Source contribution. Owner confirms final selections.

## Inspiration

An alarm identifies a signal, but a household still needs to understand what changed, who has reported in and which responses actually happened. Aenea explores one shared incident context instead of disconnected alerts.

## What it does

Users configure fictional locations and simulated devices, then send selected observations one at a time or as a sequence. A cloud agent assesses the accumulated evidence. Later signals create a new evidence revision: an outdated assessment cannot authorize a new action.

The Alexa+ browser simulation reads that same incident through authenticated MCP tools, records synthetic household check-ins and offers eligible virtual responses. Decision review exposes citations, uncertainty, policy reasons and human feedback. Rejection blocks future execution from that assessment; agreement alone is not action approval.

A reviewable handoff collects evidence, reports and saved outcomes without contacting responders. Settings also provides guarded incident cleanup. Motion never proves occupancy or safety.

## How it is built

React; Cognito authorization code with PKCE and refresh; MCP 2025-11-25 Streamable HTTP on AgentCore; private Lambda tools; IncidentBridge normalization; EventBridge and Step Functions orchestration; Strands and Amazon Bedrock assessments; deterministic Lambda policy/execution; DynamoDB transactions and S3 evidence; CloudFront, Terraform and component-selective GitHub Actions. See [AWS service responsibilities](aws-builder.md).

Access tokens are checked against issuer, signature, expiry, registered client, token type and scopes. The implementation does not require an absent Cognito access-token audience claim.

## Honest boundaries

This is a prototype, not an emergency service, medical device or certified alarm. Device inputs/effects and the Alexa interface are simulated. No Ring API, native Alexa connection or physical-device control is claimed. The browser understands explicit supported commands, not unrestricted natural-language requests. One Cognito identity owns a workspace; the shared guest is not private multi-user tenancy. Current assessment capacity is 20 signals per incident.

## Entry links

- [Source](https://github.com/tanvir4hmed/aenea)
- [Hosted application](https://aenea.qleam.com) — final clean-browser acceptance pending.
- [Testing instructions](judge-guide.md) — shared guest access is implemented; current credentials/access must be verified for submission.
- Public video: **MISSING — record and publish after hosted rehearsal.**
- Hosted model/MCP/action evidence: **MISSING — capture actual results, not source screenshots as proof.**
- New-project disclosure: Aenea repository created 16 September 2026; owner confirms authorship, eligibility and any reused components.

## Optional Open Source entry

- Project repository: [IncidentBridge](https://github.com/tanvir4hmed/incidentbridge)
- Contribution: [pinned source tree](https://github.com/tanvir4hmed/incidentbridge/tree/53ab20a35e9f7b9b87504862228b7ace090dee68)
- GitHub username: `tanvir4hmed`
- What: a separate Apache-2.0 Python event toolkit with canonical contracts, adapters and stable event identity.
- How: Aenea pins and invokes the library during ingress validation/normalization and retry identity handling.
- Why: consistent event semantics and simulation provenance make mixed household sources easier to compose and audit.
- Checked 24 September: public repository, Apache-2.0 metadata and pinned commit dated 17 September. Hosted runtime consumption evidence remains pending. This phase did not create another contribution or release.

## Feedback attachment

Finish [product feedback](product-feedback.md) using actual observations; attach relevant [friction entries](friction-log.md). The [demo runbook](demo-runbook.md) provides the recording sequence.

Rules reference: [official rules](https://amazonappdev2026.devpost.com/rules). Alternate Alexa+ simulation is allowed; supply simulation source and demonstration. Video must be publicly hosted on YouTube/Vimeo and under three minutes. Submission materials must be English or translated. AWS usage belongs in product feedback; Open Source needs contribution/repository URLs, username and explanation. Submission closes 23 October 2026 at noon Pacific; free judge access is required through judging, ending 20 November at noon Pacific. Recheck these dates before submission.
