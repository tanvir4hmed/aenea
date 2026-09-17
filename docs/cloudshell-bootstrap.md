# CloudShell bootstrap

The one-time Terraform state/bootstrap operation runs from AWS CloudShell. It creates or adopts the state bucket, imports that bucket into Terraform state, creates or adopts GitHub's OIDC provider, and creates the Aenea GitHub deployment role.

The state bucket is named `aenea-demo-<AWS-account-ID>-terraform-state`. It has versioning, server-side encryption, public access block and Terraform `prevent_destroy`. A normal `terraform destroy` stops before deleting it, so its state file remains. Do not force-destroy it. It is intentionally independent from normal application deployment.

In CloudShell, use an authorized AWS account session and run:

```bash
git clone https://github.com/tanvir4hmed/aenea.git
cd aenea
git checkout main
# Make Terraform 1.10+ available in CloudShell first.
bash scripts/bootstrap-cloudshell.sh
```

The script prints three non-secret values. Add them in GitHub repository Settings -> Environments -> demo -> Variables:

- `AWS_REGION`
- `TF_STATE_BUCKET`
- `AWS_ROLE_ARN`

The two repository-level AWS secrets are only bootstrap credentials. Normal deployments use the created OIDC role and do not read them. The `demo` environment should restrict deployments to `main`.

The prior GitHub bootstrap run had already completed when this CloudShell path was adopted. Its result was intentionally not inspected. Run this script to safely adopt/reconcile the desired state; it refuses to adopt a conflicting shared GitHub OIDC provider.
