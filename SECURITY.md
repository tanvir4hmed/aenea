# Security Policy

Do not open a public issue for a vulnerability that could expose credentials, household data, or unsafe device behavior. Report it privately to the repository owner through GitHub's private vulnerability reporting when enabled.

Never include secrets, tokens, personal data, or exploitable production endpoints in a report. This prototype is not a monitored emergency service; for an active emergency, contact the appropriate local emergency service.

Household partitioning is enforced in application code over a shared table. The deploy role is privileged within project resources; protect its GitHub OIDC trust and `dev` environment. Use only synthetic household data with shared guest access. See [operations and security boundaries](docs/operations.md). Dependency scanning, access-control testing and IAM review are continuing engineering responsibilities; this document is not a security certification.
