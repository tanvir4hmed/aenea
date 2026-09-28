# Contributing

Use a focused branch and keep changes small. Before opening a pull request:

1. Run the offline checks below for source changes. Report actual results separately from hosted verification. Never apply Terraform merely to check code.
2. Add or update tests for behavior changes.
3. Update setup and architecture documentation with the code.
4. Never commit secrets, personal data, real security footage, generated build output, or Terraform state.
5. Record any new external API, SDK, asset, and applicable terms in the third-party documentation.

By contributing, you agree that your contribution is licensed under Apache-2.0.

## Offline checks

Use Python 3.12 and Node 22, matching CI. Create an isolated virtual environment and install `python -m pip install -r requirements-dev.txt`. Then, from the repository root:

```sh
python -m ruff check .
python -m ruff format --check scripts/deploy_scope.py functions/event_contract.py services/mcp/token_auth.py tests/test_deploy_scope.py tests/test_event_contract.py tests/test_mcp_auth.py tests/test_mcp_proxy.py tests/test_mcp_server.py
python -m mypy
python -m unittest discover -s tests
npm --prefix apps/web ci
npm --prefix apps/web run lint
npm --prefix apps/web test
npm --prefix apps/web run build
```

`Source quality` runs these checks without AWS credentials. It is independent of deployment, not a post-deploy test or a configured merge protection rule.

## Coding standard

Keep UI, transport, domain rules and storage separated. New Python modules use type annotations and Ruff formatting; extend the explicit format/type gate when adopting a module. Existing Python gets a repository-wide correctness lint gate, not a claim of full strict typing. Frontend gets ESLint correctness checks; retain existing formatting when editing legacy JSX. Do not silence a check to hide a regression. Tests assert public behavior, retry identity and ownership boundaries rather than internal implementation details.

Use committed npm lockfiles with `npm ci`. Python check tools are pinned directly; runtime/transitive dependency ranges are not yet fully locked. Record that limitation rather than claiming byte-for-byte reproducibility. See the [engineering baseline](docs/engineering-baseline.md) for coverage and remaining work.
