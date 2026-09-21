# Aenea resource naming and clean-stack migration

The canonical namespace is `aenea`, without `demo` or `prod` in resource names. Examples: `aenea-github`, `aenea-state`, `aenea-reasoner`, `aenea-mcp`, `aenea-<account-id>-web`, and `aenea-<account-id>-terraform-state`.

The GitHub environment is named `dev`; it is an access-control context, not a resource-name suffix. Terraform-supported resources receive these standard tags: `Project=Aenea`, `Name=Aenea`, `Environment=dev`, `ManagedBy=Terraform`, `Repository=tanvir4hmed/aenea`, and `Lifecycle=Hackathon2026`. The CLI-managed state bucket receives the same tags except `ManagedBy=AWSCLI`.

## Clean migration completed

AWS resource names, IAM role/policy names, S3 bucket names, Cognito domains, DynamoDB table names and AgentCore runtime names cannot safely be renamed in place. On 21 September 2026 the owner authorized a clean restart. The original `aenea-demo-*` Terraform layers, IAM deployment role and policies, application buckets, certificate, and versioned state bucket were destroyed. The shared GitHub OIDC provider was deliberately retained because the new `aenea-github` role uses it.

The post-destroy service inventory found no live `aenea-demo-*` application resource. Resource Groups Tagging API can briefly return a deleted resource while its index converges, so service-specific APIs are the authority for cleanup verification.

## New-stack bootstrap

From Git Bash or AWS CloudShell with an administrator session in account `552794253321`:

```bash
cd /d/AMAZON/aenea
git pull --ff-only
export AWS_REGION=us-east-1
python scripts/bootstrap.py
```

This creates/adopts the `aenea-552794253321-terraform-state` state bucket, imports the shared GitHub OIDC provider into its state, and creates `aenea-github` plus `aenea-deployment-*` policies. Review the printed outputs; do not run it in another account.

Then create GitHub repository environment **`dev`** and add these environment variables from bootstrap output:

- `AWS_REGION=us-east-1`
- `TF_STATE_BUCKET=aenea-552794253321-terraform-state`
- `AWS_ROLE_ARN=arn:aws:iam::552794253321:role/aenea-github`
- `INGESTION_ENABLED=true`

No AWS access-key secret belongs in GitHub. The workflow uses the `dev` OIDC trust and `aenea-github` role. The repository now retains only the `dev` GitHub environment, restricted to `main`. Dispatch `Deploy changed components` with `all` to create the clean application stack. DNS should be updated only after the new certificate and CloudFront outputs are available.
