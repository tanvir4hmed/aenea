# Device-first setup and focused Alexa+ — 2 October 2026

Current behavior supersedes earlier documentation describing Response permissions, Coordinated response, optional context entry or a separate Ask Alexa+ tab.

## Setup

Settings opens the paginated Device list. Add device is a separate tab; choose an existing location or Create new location within that form. A new location and device save together. The last valid location is remembered in this tab. Manage locations expands a compact editor; deleting a location requires first moving/removing its devices. Deleting a device preserves past evidence; saved definitions referencing it must be edited before triggering.

## Live assistance

The briefing and active signals share one view with Ask Alexa+ on the right (stacked on small screens). Signal buttons open Command Center at the corresponding registered device and location without selecting a new simulation to trigger. Removed devices retain historical evidence but cannot be highlighted as present. Conversation remains incident/household scoped and browser-local. Questions still use bounded supported intents and saved facts, not unrestricted question answering or physical-device access.

Response permissions, output creation, action approval controls and backend action execution are removed. There is no runtime enable/disable flag. The workflow records evidence, assesses it and publishes a briefing. Historical action records remain readable, while removed action tools and permission endpoints are no longer exposed. The management Lambda resource name remains for compatibility with working APIs. No new calling, member reporting or device-control integration exists.

## Names and empty state

New fallback titles use location, room and signal; model-generated titles remain evidence-constrained. Older hash-only labels display a readable hazard/date fallback. Rename remains available in incident management. IDs remain unchanged in storage. Missing/deleted incidents clear their selected view; missing devices and blank catalogs show setup or unavailable-context states instead of inventing evidence. Data deletion never means hazards are resolved.

## Verification boundary

Local component fixtures and offline tests are distinct from authenticated hosted acceptance. Cloud application-data reset requires administrator authentication and is not implied by a source push. Infrastructure, Cognito users and Terraform state are outside that reset.
