# CloudShell bootstrap

The one-time bootstrap runs from AWS CloudShell or Git Bash. AWS CLI creates or adopts the state bucket, then Terraform stores bootstrap state inside it while creating or adopting GitHub's OIDC provider and the Aenea GitHub deployment role.

The canonical state bucket is named `aenea-<AWS-account-ID>-terraform-state`. It has versioning, server-side encryption, public access block and Aenea ownership tags. AWS CLI owns the bucket lifecycle; Terraform does not model it as a resource. A normal Terraform destroy therefore cannot delete it, and its state file remains. Do not delete this bucket while any Terraform layer uses it.

Run these commands either in AWS CloudShell or in Git Bash with AWS CLI credentials already configured for the target account. Do **not** use Windows PowerShell (`PS D:\...>`) unless Bash and the AWS CLI are configured there.

```bash
git clone https://github.com/tanvir4hmed/aenea.git
cd aenea
git checkout main
# Make Terraform 1.10+ available in CloudShell first.
bash scripts/bootstrap-cloudshell.sh
```

The script prints three non-secret values. Add them in GitHub repository Settings -> Environments -> dev -> Variables:

- `AWS_REGION`
- `TF_STATE_BUCKET`
- `AWS_ROLE_ARN`

The two repository-level AWS secrets are only bootstrap credentials. Normal deployments use the created OIDC role and do not read them. The `dev` environment should restrict deployments to `main`.

The prior GitHub bootstrap run had already completed when this CloudShell path was adopted. Its result was intentionally not inspected. Run this script to safely adopt/reconcile the desired state; it refuses to adopt a conflicting shared GitHub OIDC provider.

## Existing-account policy reconciliation

For this project's existing account, refresh the administrator CLI session (`aws login`) or use authorized CloudShell. Do not paste credentials into source or chat. In Bash:

```bash
export AWS_REGION=us-east-1
export TF_STATE_BUCKET=aenea-552794253321-terraform-state
aws sts get-caller-identity --query Account --output text
# Continue only if the printed account is 552794253321.
python scripts/reconcile_bootstrap.py
```

The script initializes the bootstrap backend, imports recognized existing project IAM resources when absent from state, and applies the current policy templates. It now supplies required Terraform inputs during import and stops on unexpected state errors. It changes account IAM resources; an authorized operator must review the existing account/OIDC configuration before running it. It has not been executed during Phase 7. Do not run against an unrelated account or shared OIDC setup without review.

Repository-level GitHub variables are also read by the deployment workflow; environment-level variables override them. Existing repository AWS key secrets are not consumed by normal deployment, which uses OIDC. Revoke unused static keys only after verifying no other workflow relies on them.
