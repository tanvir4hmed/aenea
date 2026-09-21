"""One-time CloudShell bootstrap; keep Terraform state in private S3 from the start."""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def capture(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def state_addresses():
    """An initialized, empty S3 backend has no state file yet."""
    result = subprocess.run(
        ("terraform", "-chdir=infra/bootstrap", "state", "list"),
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode == 0:
        return set(result.stdout.splitlines())
    if "No state file was found" in result.stderr:
        return set()
    raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)


def main():
    region = os.environ["AWS_REGION"]
    account = capture("aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text")
    bucket = f"aenea-{account}-terraform-state"
    os.environ["TF_VAR_region"] = region
    os.environ["TF_VAR_state_bucket"] = bucket
    # Check ownership before adopting the deterministically named state bucket.
    listed = json.loads(capture("aws", "s3api", "list-buckets", "--output", "json"))
    exists = any(item["Name"] == bucket for item in listed["Buckets"])
    if not exists:
        args = ["aws", "s3api", "create-bucket", "--bucket", bucket, "--region", region]
        if region != "us-east-1":
            args += ["--create-bucket-configuration", f"LocationConstraint={region}"]
        run(*args)
    run("aws", "s3api", "head-bucket", "--bucket", bucket, "--expected-bucket-owner", account)
    run("aws", "s3api", "put-public-access-block", "--bucket", bucket,
        "--public-access-block-configuration",
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true")
    run("aws", "s3api", "put-bucket-versioning", "--bucket", bucket,
        "--versioning-configuration", "Status=Enabled")
    run("aws", "s3api", "put-bucket-encryption", "--bucket", bucket,
        "--server-side-encryption-configuration",
        json.dumps({"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}))
    run("aws", "s3api", "put-bucket-tagging", "--bucket", bucket, "--tagging", json.dumps({"TagSet": [
        {"Key": "Project", "Value": "Aenea"}, {"Key": "Name", "Value": "Aenea"}, {"Key": "Environment", "Value": "dev"},
        {"Key": "ManagedBy", "Value": "AWSCLI"}, {"Key": "Repository", "Value": "tanvir4hmed/aenea"},
        {"Key": "Lifecycle", "Value": "Hackathon2026"},
    ]}))
    # A clean namespace uses a new bucket/state; never reuse an old namespace backend by accident.
    run("terraform", "-chdir=infra/bootstrap", "init", "-reconfigure", "-input=false",
        f"-backend-config=bucket={bucket}", "-backend-config=key=bootstrap/terraform.tfstate",
        f"-backend-config=region={region}", "-backend-config=encrypt=true",
        "-backend-config=use_lockfile=true")
    state = state_addresses()
    provider_arn = f"arn:aws:iam::{account}:oidc-provider/token.actions.githubusercontent.com"
    providers = json.loads(capture("aws", "iam", "list-open-id-connect-providers"))
    if any(item["Arn"] == provider_arn for item in providers["OpenIDConnectProviderList"]):
        if "aws_iam_openid_connect_provider.github" not in state:
            existing = json.loads(capture("aws", "iam", "get-open-id-connect-provider",
                                          "--open-id-connect-provider-arn", provider_arn))
            if existing["ClientIDList"] != ["sts.amazonaws.com"]:
                raise RuntimeError("Shared GitHub OIDC provider needs review before Terraform adoption")
            run("terraform", "-chdir=infra/bootstrap", "import", "-input=false",
                "aws_iam_openid_connect_provider.github", provider_arn)
    run("terraform", "-chdir=infra/bootstrap", "apply", "-input=false", "-auto-approve",
        f"-var=region={region}", f"-var=state_bucket={bucket}")
    settings = {
        "AWS_REGION": region, "TF_STATE_BUCKET": bucket,
        "AWS_ROLE_ARN": f"arn:aws:iam::{account}:role/aenea-github",
    }
    target = ROOT / ".artifacts"
    target.mkdir(exist_ok=True)
    (target / "bootstrap-settings.json").write_text(json.dumps(settings, indent=2))
    lines = ["Bootstrap configuration", ""]
    lines += [f"{name}={value}" for name, value in settings.items()]
    lines += ["", "Set these as GitHub dev environment variables, then dispatch "
              "Deploy changed components with component all."]
    output = "\n".join(lines) + "\n"
    print(output)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as summary:
            summary.write("## " + output)


if __name__ == "__main__":
    main()
