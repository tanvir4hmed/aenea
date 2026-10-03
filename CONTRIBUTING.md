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
python -m ruff format --check .
python -m mypy
python -m unittest discover -s tests
npm --prefix apps/web ci
npm --prefix apps/web run lint
npm --prefix apps/web test
npm --prefix apps/web run build
```

`Source quality` runs these checks without AWS credentials for pull requests and manual checks. It is independent of deployment, not a post-deploy test or a configured merge protection rule.

## Coding standard

Keep UI, transport, domain rules and storage separated. All Python follows Ruff formatting and repository-wide correctness checks; strict types cover the explicit core-module list in `pyproject.toml`. AWS persistence remains a dynamic boundary, not a claim of whole-repo strict typing. Frontend gets ESLint correctness checks; retain existing formatting when editing legacy JSX. Do not silence a check to hide a regression. Tests assert public behavior, retry identity and ownership boundaries rather than internal implementation details.

For isolated browser layout checks, run `node scripts/preview_ui.mjs` after installing web dependencies. It serves production components with visibly labeled synthetic fixtures at `http://127.0.0.1:4179`. It cannot exercise AWS, authentication, or live agents; never use its output as hosted/model evidence. Stop it after inspection. The fixture is not included in the production web entry point.

Use committed npm lockfiles with `npm ci`. Python check tools are pinned directly; runtime/transitive dependency ranges are not yet fully locked. Record that limitation rather than claiming byte-for-byte reproducibility. See the [engineering baseline](docs/engineering-baseline.md) for coverage and remaining work.
