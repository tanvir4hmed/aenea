"""GitHub runner entrypoint. Builds/deploys; does not run the postponed test suite."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".artifacts"
FUNCTIONS = {"ingest", "correlate", "incident_api", "invoke_reasoner", "policy", "action_executor"}


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def capture(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def terraform_init(layer):
    run("terraform", f"-chdir=infra/{layer}", "init", "-input=false",
        f"-backend-config=bucket={os.environ['TF_STATE_BUCKET']}",
        f"-backend-config=key={layer}/terraform.tfstate",
        f"-backend-config=region={os.environ['AWS_REGION']}",
        "-backend-config=encrypt=true", "-backend-config=use_lockfile=true")


def outputs(layer):
    terraform_init(layer)
    values = json.loads(capture("terraform", f"-chdir=infra/{layer}", "output", "-json"))
    return {key: value["value"] for key, value in values.items()}


def prepare_domain():
    terraform_init("tls")
    run("terraform", "-chdir=infra/tls", "apply", "-input=false", "-auto-approve")
    tls = outputs("tls")
    status = capture("aws", "acm", "describe-certificate", "--region", "us-east-1",
                     "--certificate-arn", tls["certificate_arn"],
                     "--query", "Certificate.Status", "--output", "text")
    if status not in {"ISSUED", "PENDING_VALIDATION"}:
        raise RuntimeError(f"Certificate requires attention: {status}")
    os.environ["TF_VAR_web_certificate_arn"] = tls["certificate_arn"] if status == "ISSUED" else ""
    lines = ["## aenea.qleam.com DNS", "",
             "Add these certificate records to qleam.com in Namecheap Advanced DNS.",
             "Keep validation records for certificate renewal.", "",
             "| Type | Host | Value |", "|---|---|---|"]
    for record in tls["validation_records"]:
        host = record["name"].rstrip(".").removesuffix(".qleam.com")
        lines.append(f"| {record['type']} | {host} | {record['value']} |")
    lines.extend(["", f"Certificate status: {status}.",
                  "After adding DNS, dispatch component domain to attach the issued certificate.",
                  "No certificate-validation wait or application testing is performed."])
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("\n".join(lines) + "\n")


def changed_paths():
    before = os.environ.get("BEFORE_SHA", "")
    if not before or set(before) == {"0"}:
        return []
    return capture("git", "diff", "--name-only", before, "HEAD").splitlines()


def package_functions(names):
    if not names:
        return
    dependencies = ARTIFACTS / "dependencies"
    run(sys.executable, "-m", "pip", "install", "--target", str(dependencies),
        "-r", "functions/requirements.txt")
    for name in sorted(names):
        target = ARTIFACTS / name
        shutil.copytree(dependencies, target, dirs_exist_ok=True)
        for shared in (ROOT / "functions").glob("*.py"):
            shutil.copy2(shared, target / shared.name)
        shutil.copy2(ROOT / "shared/assessment.py", target / "assessment.py")
        shutil.copy2(ROOT / f"functions/{name}/handler.py", target / "handler.py")
        shutil.make_archive(str(ARTIFACTS / name), "zip", target)


def package_reasoner():
    target = ARTIFACTS / "reasoner"
    run(sys.executable, "-m", "pip", "install", "--target", str(target),
        "--platform", "manylinux2014_aarch64", "--python-version", "3.12",
        "--implementation", "cp", "--only-binary=:all:",
        "-r", "agent/reasoner/requirements.txt")
    shutil.copy2(ROOT / "agent/reasoner/main.py", target / "main.py")
    shutil.copy2(ROOT / "shared/assessment.py", target / "assessment.py")
    shutil.make_archive(str(ARTIFACTS / "reasoner"), "zip", target)


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    paths = changed_paths()
    selected = os.environ.get("DEPLOY_COMPONENT", "")
    deployment_changed = any(
        p.startswith("scripts/") or p == ".github/workflows/deploy.yml" for p in paths
    )
    all_components = selected == "all" or (not paths and not selected)
    web = all_components or selected == "web" or any(p.startswith("apps/web/") for p in paths)
    infra_all = all_components or selected == "infrastructure" or deployment_changed
    reasoner_changed = infra_all or selected == "reasoner" or any(
        p.startswith(("agent/reasoner/", "infra/reasoner/", "shared/")) for p in paths)
    if reasoner_changed:
        package_reasoner()
        terraform_init("reasoner")
        run("terraform", "-chdir=infra/reasoner", "apply", "-input=false", "-auto-approve")
    domain = infra_all or selected == "domain" or any(p.startswith("infra/tls/") for p in paths)
    layers = {layer for layer in ("data", "platform", "app")
              if infra_all or any(p.startswith(f"infra/{layer}/") for p in paths)}
    if domain:
        layers.add("platform")
    if "platform" in layers:
        prepare_domain()
    if "data" in layers or "platform" in layers:
        layers.add("app")
    changed_functions = set(FUNCTIONS) if all_components or deployment_changed or selected == "backend" else {
        name for name in FUNCTIONS if any(p.startswith(f"functions/{name}/") for p in paths)
    }
    if any((p.startswith("functions/") and p.count("/") == 1) or p.startswith("shared/") for p in paths):
        changed_functions = set(FUNCTIONS)
    packages = FUNCTIONS if "app" in layers else changed_functions
    workflow_changed = selected == "backend" or any(p.startswith("workflows/") for p in paths)
    print(json.dumps({"web": web, "layers": sorted(layers),
                      "functions": sorted(changed_functions), "workflow": workflow_changed}))
    package_functions(packages)
    for layer in ("data", "platform", "app"):
        if layer in layers:
            terraform_init(layer)
            run("terraform", f"-chdir=infra/{layer}", "apply", "-input=false", "-auto-approve")
    for name in sorted(changed_functions):
        function = f"aenea-demo-{name}"
        run("aws", "lambda", "update-function-code", "--function-name", function,
            "--zip-file", f"fileb://{ARTIFACTS / (name + '.zip')}", "--no-cli-pager")
        # Deployment sequencing only: AWS rejects overlapping code/config updates.
        run("aws", "lambda", "wait", "function-updated-v2", "--function-name", function)
    if workflow_changed and "app" not in layers:
        definition = (ROOT / "workflows/incident_state_machine/definition.asl.json").read_text()
        for name in ("correlate", "invoke_reasoner", "policy", "action_executor"):
            arn = capture("aws", "lambda", "get-function", "--function-name", f"aenea-demo-{name}",
                          "--query", "Configuration.FunctionArn", "--output", "text")
            definition = definition.replace("${" + name + "_arn}", arn)
        target = ARTIFACTS / "workflow.json"
        target.write_text(definition)
        app = outputs("app")
        run("aws", "stepfunctions", "update-state-machine", "--state-machine-arn",
            app["workflow_arn"], "--definition", f"file://{target}")
    if web or "platform" in layers:
        platform = outputs("platform")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            dns = platform["website_dns"]
            summary.write(f"\nWebsite DNS: CNAME `{dns['host']}` → `{dns['value']}` (TTL Automatic).\n")
            summary.write(f"Website origin currently configured: {platform['web_url']}\n")
        config = ARTIFACTS / "config.json"
        config.write_text(json.dumps(platform["web_config"]))
        if web:
            run("npm", "install", "--package-lock=true", cwd=ROOT / "apps/web")
            run("npm", "run", "build", cwd=ROOT / "apps/web")
            # No --delete: old hashed assets stay available to open browser sessions.
            run("aws", "s3", "sync", "apps/web/dist/assets",
                f"s3://{platform['web_bucket']}/assets",
                "--cache-control", "public,max-age=31536000,immutable")
            run("aws", "s3", "cp", "apps/web/dist/index.html",
                f"s3://{platform['web_bucket']}/index.html", "--cache-control", "no-cache",
                "--content-type", "text/html")
        run("aws", "s3", "cp", str(config), f"s3://{platform['web_bucket']}/config.json",
            "--cache-control", "no-store", "--content-type", "application/json")
        run("aws", "cloudfront", "create-invalidation",
            "--distribution-id", platform["distribution_id"],
            "--paths", "/index.html", "/config.json", "/", "/command-center",
            "/simulation-lab", "/auth/callback", "/alexa-sim", "/check-in", "/handoff")


if __name__ == "__main__":
    main()
