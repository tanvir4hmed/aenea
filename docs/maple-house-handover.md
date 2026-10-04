# Maple House handover

Current product: one fixed fictional family home, not a property/room management tool. The account boundary remains one authenticated Cognito identity per dataset; the same house template does not share private records between identities.

## Product and data contract

- Maple House has 10 fixed rooms in five categories: Living & Entrance (Entrance, Living Room), Kitchen & Dining (Kitchen, Dining Room), Bedrooms (Master Bedroom, Family Bedroom), Washrooms (Master Washroom, Family Washroom, Living Room Washroom), and Garage. Other rooms/outdoor areas are intentionally omitted. Category widths respond to device counts; a measured dense grid repacks shorter categories into available space. Washrooms share one sensor box, while room/device tiles wrap proportionally. The house always stays visible without category tabs.
- The canonical definition is `functions/house_layout.json`, imported by the web app and packaged with every Lambda. Explicit, permanent device seed numbers preserve IDs when rooms are reordered, removed or renamed. Never reuse a removed seed number for another device.
- A new dataset starts with 24 simulated devices covering the supported safety/security sensor types. No incident, event, conversation, run or saved simulation is manufactured at startup.
- A missing catalog reads the furnished defaults. Saving uses the existing conditional revision write. A deliberately emptied saved catalog stays empty; deleted devices do not reappear on reload. Rooms remain visible even with no devices.
- The API only accepts Maple House and the canonical room names. Settings, the map and simulation filters use the same room list. Device names default to `Room · Device type` and remain editable.
- Existing non-Maple catalogs are retained read-only pending an explicit administrator reset. Deployment never silently deletes application data.

## Loading and consistency

The login flash was caused by treating `/auth/callback` as an unknown page before OAuth completed. Routing now recognizes this transition and presents a boot state until configuration/token exchange finishes. Genuine unknown paths still show a not-found page.

Known web routes are deployed as small HTML aliases in the same private S3 origin, avoiding the missing-object/error-page lookup on normal deep links. All entry HTML is `no-cache`; configuration is `no-store`; hashed assets are immutable with a one-year maximum CDN TTL. Route aliases are invalidated together at deployment.

Opening an old incident does not invoke the AI model. Status reads check deletion and the current evidence revision, then reuse the deterministic device projection saved with the briefing. The projection is published in the existing revision-checked transaction and used only for a matching event revision. Older or unfinished briefings fall back to reconstruction. Final revision checks still prevent a mid-read update from being advertised as current.

The device projection is not duplicated into historical briefing audit rows. Evidence/history pages remain on demand. Open incident status polls every 10 seconds, resolved status every 60 seconds, and the incident list every 30 seconds. Hidden tabs skip polling. This is polling, not a sub-second push guarantee; actual cloud latency must be measured after deployment.

## Cost and architecture

Retain private S3/CloudFront hosting, Cognito, HTTP API, on-demand Lambda and DynamoDB, EventBridge/Step Functions and the existing short-idle AgentCore runtimes. There is no NAT gateway, load balancer, always-running VM, relational database or paid cache cluster in this application stack. Do not trade away revision checks, deletion guards, evidence versioning, recovery or encryption merely to reduce a small demo bill.

This release reduces repeated historical reads and redundant polling, lets immutable assets use their full CDN cache lifetime, and aborts abandoned multipart uploads after seven days. It does not automatically expire completed incident evidence. The existing bounded model context/repeated-evidence coalescing remains. There is no unconditional claim of a lowest possible monthly cost: account free tiers, traffic, model usage, logging and retained evidence change the bill.

Sources: [DynamoDB on-demand pricing](https://aws.amazon.com/dynamodb/pricing/) and [AWS multipart-upload cost guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html).

## Release and clean reset

Pushes to main continue to deploy automatically in one workflow. Pull-request quality checks remain separate. No manual-only release step has been introduced.

Before handing over a clean cloud dataset, verify the AWS account and the exact Aenea resources. Pause writers/scheduled workers, drain in-flight work, remove the authorized application records and evidence object versions, and restore service configuration. Keep the table, buckets, Terraform state, Cognito users and code. Recheck that only house/system setup remains and that no old incident/run/library is returned. Cloud service logs, backups and execution history have separate retention; empty app lists alone do not prove those retained copies are purged.

The administrator utility is `scripts/reset_demo.py --profile <profile> --confirm-account <account-id>` (dry-run by default). Only append `--execute` after explicit deletion authorization and inventory review. It requires Aenea resource tags, checks evidence ownership, pauses write-capable Lambdas and existing schedules, drains in-flight calls, and restores the previous service settings in a `finally` block. Missing schedules are reported, not silently created. Never run this utility from deployment. Minimal incident/event replay guards remain as system metadata so delayed retries cannot recreate removed incidents; reset guards are excluded from the user-facing deletion list.

Sign out/clear local drafts on demo browsers so old conversation snippets and pending client requests are not carried into handover. Use fictional data for any subsequent acceptance exercise, then remove it explicitly.

Cloud checkpoint (2026-10-04): the authorized reset removed the prior incident/application records and 13 evidence object versions. Both household catalogs were then conditionally updated to the compact 10-room/24-device layout. Read-back found zero incident summaries, zero evidence versions/delete markers, the cleanup schedule enabled and all paused writers restored. Only house catalogs and minimal replay guards remained. This is a data verification checkpoint, not authenticated UI or deployment acceptance.

## Validation boundaries

Use focused catalog/status/revision/routing tests plus web lint/build. The local UI fixture is synthetic and never creates cloud incidents. AWS deployment, authenticated visual acceptance and a clean-cloud verification must be reported separately from offline checks.
