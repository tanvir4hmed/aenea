# Aenea — submission draft, not submitted

> Current scope (6 October 2026): device actions, output permissions and incident note entry are retired. Use [the current user guide](user-guide.md) for the supported device → saved simulation → trigger → briefing → review/resolve flow. Action/member walkthroughs below are historical and must not be used as current demo or submission claims.

Updated 30 September 2026. Release acceptance is [still open](release-checklist.md). Review these source claims against the actual deployment and recording before submitting.

**Tagline:** Shared household context, accountable incident coordination.

**Primary:** Alexa+ alternate experience simulation.

**Proposed minis:** AWS Builder and the separate IncidentBridge Open Source contribution. Owner confirms final selections.

## Inspiration

An alarm identifies a signal, but a household still needs to understand what changed and which permitted responses actually happened. Aenea explores one coordinated incident context instead of disconnected alerts.

## What it does

Users configure locations and simulated inputs/outputs, save state/repeat profiles, then start selected cloud runs. Related alerts automatically create/join named incidents. A cloud agent assesses current evidence; later changes invalidate older approvals. Human Resolve closes an incident, while simulation stop, clear and acknowledgment remain distinct.

The Alexa+ browser simulation reads the same incident through authenticated MCP and application APIs, shows persistent live briefings and offers eligible virtual responses. Optional text/voice commands are bounded; unverified notes stay separate from sensor evidence. Decision review exposes citations, uncertainty, policy reasons and human feedback. Rejection blocks future execution; agreement alone is not action approval.

History preserves evidence, notes, decisions and saved outcomes without contacting responders. Settings provides guarded incident cleanup. No new member reporting is included. Motion never proves occupancy or safety.

## How it is built

React; Cognito authorization code with PKCE and refresh; MCP 2025-11-25 Streamable HTTP on AgentCore; private Lambda tools; IncidentBridge normalization; EventBridge and Step Functions orchestration; Strands and Amazon Bedrock assessments; deterministic Lambda policy/execution; DynamoDB transactions and S3 evidence; CloudFront, Terraform and component-selective GitHub Actions. See [AWS service responsibilities](aws-builder.md).

Access tokens are checked against issuer, signature, expiry, registered client, token type, resource-bound audience and scopes; old unbound sessions need a fresh login.

## Honest boundaries

This is a prototype, not an emergency service, medical device or certified alarm. Device inputs/effects and the Alexa interface are simulated. No Ring API, native Alexa or physical control is claimed. Commands are constrained to approved intents, not unrestricted control. One Cognito identity owns a workspace; the guest is shared. Model context is bounded without a 20-event incident lifetime cutoff. Simulator allowances restrict test generation only; cloud scheduling is best effort, not a real-time safety guarantee.

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
