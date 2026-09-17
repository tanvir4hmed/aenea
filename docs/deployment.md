# Cloud deployment

Implementation is written for Phases 2–3. Deployment success and end-to-end behavior have not been verified. Per the project workflow, the assistant pushes implementation; GitHub Actions owns build/deploy execution and its results will be reviewed later.

## First-time AWS setup

Use an authorized AWS CloudShell session for the one-time state/OIDC bootstrap. No AWS credential is committed or pasted into application configuration.

1. Choose the AWS account and region. Bootstrap uses us-east-1 by default and creates the explicit Phase 2–3 deployment policy.
2. Follow [CloudShell bootstrap](cloudshell-bootstrap.md). It creates/adopts the private state bucket and GitHub OIDC role, then stores bootstrap state in `bootstrap/terraform.tfstate` in that bucket. Never commit state.
3. In GitHub create environment `demo`, limit deployment branches to main, and set environment variables `AWS_REGION`, `TF_STATE_BUCKET`, and `AWS_ROLE_ARN` from bootstrap output.
5. Dispatch **Deploy changed components** with `all` once. Subsequent main pushes deploy affected components automatically.
6. Create a Cognito demo user as an account administrator. Self-registration is disabled. Hosted UI uses authorization code + PKCE and API routes require access-token scopes.

The initial bootstrap requires existing AWS authority: a GitHub role cannot create itself before it exists. The bootstrap role has no default AdministratorAccess policy. Environment protection must restrict the OIDC trust to the intended branch. This account's GitHub subject template includes stable repository/owner IDs, so the role trusts the exact emitted demo-environment subject. Configuration values in the frontend (API URL, user-pool client ID and Cognito domain) are public identifiers, not secrets.

After the first bootstrap apply in CloudShell, copy `infra/bootstrap/backend.tf.json.example` to `infra/bootstrap/backend.tf.json`, then run `terraform -chdir=infra/bootstrap init -migrate-state` with backend-config arguments for the new bucket, `key=bootstrap/terraform.tfstate`, region, `encrypt=true` and `use_lockfile=true`. Keep the resulting state private. The backend file is ignored by Git to preserve the first-time bootstrap path.

## State layers

- bootstrap: CLI-managed retained state bucket plus Terraform-managed deployment OIDC role.
- tls: ACM certificate for aenea.qleam.com in us-east-1; DNS validation records are output for manual entry at Namecheap.
- data: DynamoDB state and versioned evidence S3; protected against routine destroy.
- platform: private web S3, CloudFront origin access, Cognito, API Gateway JWT auth/logging, EventBridge bus, delivery DLQ and operations SNS.
- app: function roles/code/environment, Step Functions, EventBridge delivery, API integrations and execution-failure alarm.

Each regular layer uses its own S3 state key and native S3 locking. Terraform owns infrastructure/configuration. The deployment script owns subsequent Lambda code updates; Terraform ignores package filename/hash changes to avoid restoring old code. Step Functions-only changes update the workflow directly; its source remains the Terraform template.

## Selective deployment

- Web changes build/deploy the frontend only.
- One function directory updates that function only.
- Shared function code/dependencies update their consuming functions.
- State-machine changes update only that workflow.
- A Terraform layer change applies that layer; data/platform changes also refresh dependent app wiring.
- Platform changes refresh public web configuration without rebuilding unchanged frontend code.
- Changes to `scripts/deploy.py`, the deploy workflow, or an explicit all dispatch refresh all components. Bootstrap/reconciliation scripts do not trigger application deployment.
- Documentation and planning changes do not trigger deployment.

Builds run on GitHub Linux runners. No test suite, browser verification or post-deploy health probe is invoked by this workflow. AWS wait-for-update calls sequence Lambda deployments; they are not application tests.

Python dependencies are assembled on the runner with the pinned IncidentBridge commit. Frontend npm and Terraform provider lockfiles still need to be captured from the first successful pipeline for stronger dependency reproducibility. Build/deployment results are intentionally unreviewed at this stage.

## Operational boundaries

The default demo maps one Cognito identity to one household. Shared membership invitations come later. SNS has no recipient until a verified subscription is added. EventBridge DLQ captures delivery failures; failed Step Functions executions trigger a separate alarm and require operator investigation/re-drive. A bucket write or publish failure can be retried using the same event ID and payload.

No real device, Ring account or external weather feed is required. The selected domain is aenea.qleam.com; see [custom-domain setup](custom-domain.md). CloudFront's AWS hostname is used until the certificate is issued. HTTP API does not have a direct WAF association in this implementation.
