# Aenea resource naming and clean-stack migration

The canonical namespace is `aenea`, without `demo` or `prod` in resource names. Examples: `aenea-github`, `aenea-state`, `aenea-reasoner`, `aenea-mcp`, `aenea-<account-id>-web`, and `aenea-<account-id>-terraform-state`.

The GitHub environment is named `development`; it is an access-control context, not a resource-name suffix. Terraform-supported resources receive these standard tags: `Project=Aenea`, `Name=Aenea`, `Environment=development`, `ManagedBy=Terraform`, `Repository=tanvir4hmed/aenea`, and `Lifecycle=Hackathon2026`. The CLI-managed state bucket receives the same tags except `ManagedBy=AWSCLI`.

## Why a parallel migration is required

AWS resource names, IAM role/policy names, S3 bucket names, Cognito domains, DynamoDB table names and AgentCore runtime names cannot safely be renamed in place. The original `aenea-demo-*` stack remains in its old state bucket. It must stay intact until the new Aenea stack is deployed and verified. Do not run Terraform destroy against the old state or delete the old state bucket.

After final validation, review each old resource and explicitly approve a separate cleanup. AWS supports retagging many old resources, but tagging cannot rename an ARN, bucket, role, Lambda, table or runtime. Resources created outside Terraform must be located using Resource Groups Tagging API plus service-specific lists; the old state bucket is one such CLI-managed resource.

## New-stack bootstrap

From Git Bash or AWS CloudShell with an administrator session in account `552794253321`:

```bash
cd /d/AMAZON/aenea
git pull --ff-only
export AWS_REGION=us-east-1
python scripts/bootstrap.py
```

This creates/adopts only the new `aenea-552794253321-terraform-state` state bucket, imports the shared GitHub OIDC provider into the new state, and creates `aenea-github` plus `aenea-deployment-*` policies. It uses `terraform init -reconfigure` to avoid accidental reuse of the old bootstrap backend. Review the printed outputs; do not run it in another account.

Then create GitHub repository environment **`development`** and add these environment variables from bootstrap output:

- `AWS_REGION=us-east-1`
- `TF_STATE_BUCKET=aenea-552794253321-terraform-state`
- `AWS_ROLE_ARN=arn:aws:iam::552794253321:role/aenea-github`
- `INGESTION_ENABLED=true`

No AWS access-key secret belongs in GitHub. The workflow uses the `development` OIDC trust and `aenea-github` role. After variables are saved, dispatch `Deploy changed components` with `all`. The new state has no app-layer state, so this deliberately creates a parallel Aenea stack. DNS can only point at one CloudFront distribution; retain the old DNS record until the new certificate/output has been reviewed.

The old GitHub `demo` environment and its variables can remain temporarily, because old workflow runs use the old role. Do not delete the old environment, old role, old state bucket or old resources until the new stack is verified and cleanup is explicitly authorized.
