# Friction Log

This optional evidence log starts at project baseline. Add only reproducible, useful issues encountered during the build.

| Date | Tool or API | Task | Steps | Expected | Actual | Severity | Workaround | Suggested improvement | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Recorded 2026-09-21 | Bash / Windows | Run bootstrap | User ran bash script in PowerShell without Bash | Bootstrap starts | Command not recognized | Medium | Use documented CloudShell/Git Bash environment | Make shell prerequisite prominent | User-provided error in project conversation; original occurrence date not asserted |
| Recorded 2026-09-21 | Terraform import | Adopt existing resources | Import before passing state_bucket | Import succeeds | Required variable absent | High | Supply TF_VAR inputs before imports | Share init/import/apply environment consistently | User-provided traceback; reconciliation source updated, not executed |
| Recorded 2026-09-21 | IAM / AWS provider | Deploy/read infrastructure | Terraform reads S3 configuration and creates tagged API stage | Scoped policy sufficient | Missing replication/tagging actions | High | Update project deployment policy templates | Document provider read/tag actions beside resources | User-provided AccessDenied outputs; no final live-policy claim |
| Recorded 2026-09-21 | AWS CLI login | Synchronize runtime permissions | Read caller identity with expired administrator session | Valid account identity | Session expired | Blocking | Authorized operator must refresh login | Document that GitHub OIDC and local admin sessions are separate | Read-only CLI failure observed during Phase 5 |
| 2026-09-23 | Cognito / MCP JWT | Read household state through MCP | Use Cognito access token with custom scopes | Runtime accepts the registered client token | Token has no `aud`; private runtime required it | High | Validate issuer, signature, client, access-token type and scope; retain AgentCore client/scope checks | Do not equate an ID-token audience with an API resource audience; document URL resource-server migration separately | Hosted error reported by user; source corrected in Phase 1 |

Severity: Low, Medium, High or Blocking. Never include credentials, personal data or private endpoints.
