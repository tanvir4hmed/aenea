# CloudShell bootstrap

The one-time bootstrap runs from AWS CloudShell or Git Bash. AWS CLI creates or adopts the state bucket, then Terraform stores bootstrap state inside it while creating or adopting GitHub's OIDC provider and the Aenea GitHub deployment role.

The state bucket is named `aenea-demo-<AWS-account-ID>-terraform-state`. It has versioning, server-side encryption and public access block. AWS CLI owns the bucket lifecycle; Terraform does not model it as a resource. A normal Terraform destroy therefore cannot delete it, and its state file remains. Do not delete this bucket while any Terraform layer uses it.

Run these commands either in AWS CloudShell or in Git Bash with AWS CLI credentials already configured for the target account. Do **not** use Windows PowerShell (`PS D:\...>`) unless Bash and the AWS CLI are configured there.

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
