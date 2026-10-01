# Session and Settings update — 2026-10-01

- Browser sign-in is persisted for an absolute 24 hours. Access tokens remain short-lived and refresh on requests. Cognito refresh-token validity is explicitly one day in Terraform.
- Existing tab-only sessions require one new sign-in. Sign-out clears both stores. Revoked credentials, cleared storage and authentication failures can still require earlier sign-in; this is not an unconditional availability promise.
- Token persistence uses browser local storage, not an HttpOnly cookie. It remains accessible to same-origin JavaScript; avoid untrusted scripts and sign out on shared computers. A server-session/BFF migration is outside this change.
- Settings groups locations, devices, output permissions and cleanup into separate views. Location/device filters and ten-item pagination bound the catalog lists; output permissions are paginated without dropping edits on other pages. Existing save/delete APIs and confirmation safeguards remain unchanged.
- Alexa+ controls and data prerequisites are documented in [the page guide](alexa-page-guide.md).

Verification: 36 JavaScript tests passed, including refresh failure, logout races, new-tab persistence and absolute expiry; frontend lint/build and Terraform formatting passed. Hosted 24-hour endurance, visual/responsive acceptance and deployed Cognito configuration have not been verified. No Terraform apply or deployment waiting was performed.
