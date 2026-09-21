"""Adopt existing bootstrap IAM resources before applying their Terraform configuration."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def capture(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def exists(*args):
    result = subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, check=False)
    if result.returncode == 0:
        return True
    if "NoSuchEntity" in result.stderr:
        return False
    raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)


def state_addresses():
    result = subprocess.run(("terraform", "-chdir=infra/bootstrap", "state", "list"), cwd=ROOT,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode == 0:
        return set(result.stdout.splitlines())
    if "No state file was found" in result.stderr:
        return set()
    raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)


def import_if_present(address, resource_id, present):
    if present and address not in state_addresses():
        run("terraform", "-chdir=infra/bootstrap", "import", "-input=false", address, resource_id)


def main():
    region = os.environ["AWS_REGION"]
    bucket = os.environ["TF_STATE_BUCKET"]
    os.environ["TF_VAR_region"] = region
    os.environ["TF_VAR_state_bucket"] = bucket
    account = capture("aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text")
    run("terraform", "-chdir=infra/bootstrap", "init", "-input=false",
        f"-backend-config=bucket={bucket}", "-backend-config=key=bootstrap/terraform.tfstate",
        f"-backend-config=region={region}", "-backend-config=encrypt=true", "-backend-config=use_lockfile=true")
    role_name = "aenea-github"
    provider_arn = f"arn:aws:iam::{account}:oidc-provider/token.actions.githubusercontent.com"
    import_if_present("aws_iam_openid_connect_provider.github", provider_arn,
                      exists("aws", "iam", "get-open-id-connect-provider", "--open-id-connect-provider-arn", provider_arn))
    import_if_present("aws_iam_role.deploy", role_name,
                      exists("aws", "iam", "get-role", "--role-name", role_name))
    attached = []
    if exists("aws", "iam", "get-role", "--role-name", role_name):
        attached = json.loads(capture("aws", "iam", "list-attached-role-policies", "--role-name", role_name))["AttachedPolicies"]
    attached_arns = {item["PolicyArn"] for item in attached}
    for name, address in {
        "core": "aws_iam_policy.deployment_core",
        "workflow": "aws_iam_policy.deployment_workflow",
        "edge": "aws_iam_policy.deployment_edge",
    }.items():
        arn = f"arn:aws:iam::{account}:policy/aenea-deployment-{name}"
        present = exists("aws", "iam", "get-policy", "--policy-arn", arn)
        import_if_present(address, arn, present)
        attachment = f"aws_iam_role_policy_attachment.builtin_{name}"
        import_if_present(attachment, f"{role_name}/{arn}", arn in attached_arns)
    run("terraform", "-chdir=infra/bootstrap", "apply", "-input=false", "-auto-approve",
        f"-var=state_bucket={bucket}")


if __name__ == "__main__":
    main()
