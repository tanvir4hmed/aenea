# Contributing

Use a focused branch and keep changes small. Before opening a pull request:

1. Follow the authorized verification scope. Terraform formatting uses `terraform fmt -check -recursive infra`; pure Python regressions use `python -m unittest discover -s tests`. No dedicated JavaScript lint/typecheck configuration is currently supplied. The project owner has deferred local builds and test execution; do not imply those checks passed.
2. Add or update tests for behavior changes.
3. Update setup and architecture documentation with the code.
4. Never commit secrets, personal data, real security footage, generated build output, or Terraform state.
5. Record any new external API, SDK, asset, and applicable terms in the third-party documentation.

By contributing, you agree that your contribution is licensed under Apache-2.0.
