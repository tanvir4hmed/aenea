#!/usr/bin/env bash
# Run once in AWS CloudShell from an authorized account session.
set -euo pipefail

if ! command -v terraform >/dev/null; then
  echo "Terraform 1.10+ is required in CloudShell. Install it, then rerun this script." >&2
  exit 1
fi

export AWS_REGION="${AWS_REGION:-us-east-1}"
export TF_VAR_region="$AWS_REGION"
export TF_VAR_environment="demo"
export TF_IN_AUTOMATION="true"

python3 scripts/bootstrap.py
