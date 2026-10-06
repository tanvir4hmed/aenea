# Deployment and development

Aenea deploys to AWS through GitHub Actions using Terraform. Configuration and state are separate from application data. Use an AWS account you administer and a GitHub repository/environment you control.

## Prerequisites

- Python 3.12, Node.js 22, AWS CLI v2, Git and Terraform 1.10 or later within the declared <2.0 range.
- AWS authority to create project IAM/OIDC resources, state storage and the services declared under `infra`.
- Amazon Bedrock/AgentCore availability and model access in the selected region; the project defaults to `us-east-1` and Amazon Nova Lite.
- Access to manage GitHub Actions, the `dev` environment and variables.
- DNS control for `aenea.qleam.com` when using the configured custom domain. For another domain, change the domain definitions and associated redirects/origins before deployment.

Clone the repository and install dependencies using the commands in [CONTRIBUTING](../CONTRIBUTING.md). No real sensor, Ring account or Echo is required.

## 1. Bootstrap state and deployment identity

Bootstrap uses an authenticated AWS CLI session. In CloudShell or Git Bash, from the repository root:

```sh
aws sts get-caller-identity
bash scripts/bootstrap-cloudshell.sh
```

The script creates/adopts `aenea-<account-id>-terraform-state` through AWS CLI, enables encryption/versioning, blocks public access, then initializes `bootstrap/terraform.tfstate` and creates/adopts the OIDC deployment identity and project policies.

Verify the account before running. Terraform 1.10+ must already be installed. A normal Terraform destroy cannot remove this CLI-owned bucket. Keep it while any layer uses its state.

PowerShell does not include Bash by default. With Python, AWS CLI and Terraform available, use:

```powershell
$env:AWS_REGION = 'us-east-1'
python scripts/bootstrap.py
```

The bootstrap trust is configured for this repository's exact GitHub `dev` environment subject, including stable owner/repository IDs. For a fork, review `infra/bootstrap/main.tf.json` and replace the trust with that repository's actual emitted OIDC subject before applying. Do not broaden it to arbitrary repositories.

For existing IAM resources/policies, use an administrator session to reconcile them:

```powershell
aws login
$env:AWS_REGION = 'us-east-1'
$env:TF_STATE_BUCKET = 'aenea-YOUR_ACCOUNT_ID-terraform-state'
aws sts get-caller-identity
python scripts/reconcile_bootstrap.py
```

This imports recognized resources missing from bootstrap state and applies current policy templates. It is a cloud IAM mutation, not a local test. Review shared OIDC ownership first. Bootstrap policy edits do not automatically update the deployed policy.

## 2. Configure GitHub

Create environment **dev** and restrict deployment to **main**. Set these environment variables (repository variables are also supported; environment values override them):

| Variable | Value |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `TF_STATE_BUCKET` | State bucket printed by bootstrap |
| `AWS_ROLE_ARN` | GitHub deployment role ARN printed by bootstrap |
| `INGESTION_ENABLED` | `true`; optional operator pause control |

Normal deployment uses OIDC, not AWS access-key secrets. Do not store browser credentials, Terraform state or cloud tokens in source.

## 3. Deploy and configure HTTPS

Run **Deploy changed components** manually with **all** for initial deployment. Later qualifying main pushes select affected components automatically.

The deployment sequence packages the reasoner before dependent app resources, applies data/platform/app layers, packages MCP after app wiring exists, and uploads web assets/configuration. The workflow prepares the ACM certificate and prints DNS records.

At your DNS provider:

1. Add the ACM validation CNAME records exactly as printed.
2. Keep validation records for certificate renewal.
3. After certificate issuance, dispatch component **domain** to attach HTTPS configuration.
4. Point the `aenea` CNAME to the CloudFront hostname printed by the workflow.

Until the custom certificate is attached, the CloudFront AWS hostname is the configured origin. `/config.json` contains the deployed API URL, public Cognito client ID and Cognito domain; it must come from the matching platform outputs.

## 4. Provision sign-in accounts

Cognito self-signup is disabled. Get `user_pool_id` from the platform Terraform outputs and create an account using the Cognito console or AWS CLI:

```sh
aws cognito-idp admin-create-user --region us-east-1 \
  --user-pool-id USER_POOL_ID --username USER_EMAIL \
  --user-attributes Name=email,Value=USER_EMAIL Name=email_verified,Value=true \
  --message-action SUPPRESS
```

Set a permanent policy-compliant password with the console or `admin-set-user-password`. Keep real passwords out of logs/source. The shared guest login displayed by `apps/web/src/main.jsx` is intentional public test access; provision that matching test account or change its displayed credentials for your deployment. Never attach private household data to a shared account.

Open the configured web origin, sign in and use [the user guide](user-guide.md). A missing catalog supplies Maple House's initial devices; no incidents or saved definitions are created automatically.

## Terraform layers

| Layer | State key and responsibility |
| --- | --- |
| bootstrap | `bootstrap/terraform.tfstate`: GitHub OIDC role and deployment policies |
| tls | `tls/terraform.tfstate`: ACM certificate in us-east-1 |
| data | `data/terraform.tfstate`: DynamoDB and versioned evidence S3 |
| platform | `platform/terraform.tfstate`: web hosting, Cognito, API Gateway, event bus, DLQ and operations topic |
| reasoner | `reasoner/terraform.tfstate`: code bucket and IAM AgentCore runtime |
| app | `app/terraform.tfstate`: Lambda, APIs, workflows, schedules and application roles |
| mcp | `mcp/terraform.tfstate`: MCP code/runtime and SSM discovery parameter |

State uses private S3 with native lockfiles. Terraform manages resource configuration; the deployment script updates Lambda code separately, with Terraform ignoring subsequent package filename/hash changes. Never upload local state or secrets.

## Selective releases

| Changed source | Deployment scope |
| --- | --- |
| `apps/web/**` | Web build/upload |
| One `functions/<name>/**` | That Lambda |
| Shared `functions/*.py`, dependencies, or `shared/**` | Dependent Lambda packages; shared model contracts also update reasoner |
| `agent/reasoner/**` | Reasoner runtime |
| `services/mcp/**` | MCP runtime |
| `workflows/**` | State-machine definition |
| `infra/<layer>/**` | Layer and required dependencies |
| Platform/TLS | App/config/domain wiring and MCP dependency refresh |
| README/docs only | No application deployment |

A change to the canonical house JSON also rebuilds web and shared consumers. The source-quality workflow runs on pull requests or manual dispatch. Deployment does not run browser tests or post-release acceptance checks. Lambda wait calls only serialize AWS updates.

## Local development

The frontend can build independently. For live authenticated use it needs an already-deployed backend:

1. Get the correct public configuration from your deployed origin's `/config.json`.
2. Put it in ignored `apps/web/public/config.json`.
3. Add the exact local origin, callback and logout URL to Cognito and API/MCP allowed origins through the platform configuration.
4. Start `npm --prefix apps/web run dev` and open its reported URL.

The current platform defaults do not allow localhost OAuth/MCP origins. A local build alone does not provide authentication or AWS services.

For offline layout work, `node scripts/preview_ui.mjs` serves clearly labelled fixtures at `http://127.0.0.1:4179`. It cannot test real authentication or models. Stop it after inspection. Run the checks in [CONTRIBUTING](../CONTRIBUTING.md) before releasing source changes.
