# Workspace responsiveness

- Initial incident selection now follows the first incident-list response instead of waiting for the next 10-second polling tick. Explicit user selections remain authoritative.
- Recently viewed incidents have a bounded, memory-only preview cache (8 entries). Previews say they are updating and disable assessment-based confirmations until a fresh response arrives. Sign-out/expiry and deletion discard relevant cached data.
- Identical concurrent JSON reads share one network request. Failed writes are never replayed except an authorization rejection, which receives one token refresh attempt.
- Timeline polling is restricted to incident views and visible browser tabs. Hidden simulation runs stop polling; server generation is unaffected. Settings permissions/cleanup load on first visit to those tabs.
- Secondary pages load as separate bundles. The initial JS build changed from 332.33 kB to 276.97 kB before gzip at this checkpoint. This measures bundle size, not hosted latency.
- A bounded Lambda-worker evidence cache reuses a snapshot only for the same household, incident and committed event count, for up to 60 seconds. Deletion checks, current actions, notes, permissions and revision confirmation remain live. A revision race marks the assessment as outdated.

Request deduplication, no replay after ambiguous write failure, cache isolation/expiry and disabled cached approvals have regression checks. Hosted cold-start and large-history latency still need measurement; the app does not claim real-time delivery guarantees.
