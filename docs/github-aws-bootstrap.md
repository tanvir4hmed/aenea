# GitHub AWS bootstrap

In repository Settings -> Secrets and variables -> Actions -> Repository secrets, add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. If these are temporary session credentials, also add AWS_SESSION_TOKEN. No keys belong in ordinary Variables, source files or chat.

Use credentials belonging to the intended AWS account with authority to create the state bucket, IAM OIDC provider, deployment role and managed policy. Avoid root-account keys. The bootstrap script needs S3 bucket listing/configuration and IAM provisioning permissions. An existing administrative bootstrap identity can run this one-time operation; the created deployment role uses the explicit policy in infra/bootstrap.

Run Bootstrap AWS access on main. Region defaults to us-east-1. The workflow creates a private versioned state bucket, adopts it into Terraform, creates/adopts GitHub's OIDC provider, and creates the Aenea role and policy. It outputs public configuration in bootstrap-public-settings and the job summary. Secrets and Terraform state are not uploaded as artifacts.

The workflow automatically writes its outputs into GitHub environment demo variables AWS_REGION, TF_STATE_BUCKET and AWS_ROLE_ARN. Configure environment deployment branches to main before allowing normal OIDC deployments. The OIDC role trusts only this repo's demo environment.

Then run Deploy changed components with all. It emits DNS records for aenea.qleam.com. After the user enters those records at Namecheap, component domain attaches the issued certificate.

The initial deployment policy covers Phase 2–3 services, not AdministratorAccess. Some create/discovery operations require wildcard resources, so it is a deployment policy rather than a runtime-role policy. Later phases may require deliberate extension.

Keep bootstrap credentials only as long as needed; regular deployment uses short-lived OIDC credentials. The assistant has not executed or verified the bootstrap because AWS secrets were not yet configured.
