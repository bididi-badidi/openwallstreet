# Project context

OpenWallstreet collects primary-source annual-report evidence. The deployed app is in `src/web/`; `src/credibility/` is separate Python research tooling. Read [architecture](docs/architecture.md) before changing boundaries or evidence semantics.

## Working rules

- Do not use en-dashes in authored prose. Preserve verbatim source quotations.
- Keep changes focused and preserve unrelated work. Use a short-lived `feat/`, `fix/`, `docs/`, or `chore/` branch; keep `main` releasable. Follow [development and branching](docs/development.md).
- Follow [repository layout and hygiene](docs/repository-layout.md). Keep current guides in `docs/`, plans in `docs/plans/`, historical material in `docs/archive/`, and scratch outputs in ignored `artifacts/` or `data/`.
- Update links when moving files. Stage explicit task files and inspect the diff; do not sweep local reference libraries into commits.
- Never commit credentials, private research runs, dependencies, or build/runtime output. Use placeholder example files for setup.
- Preserve source restrictions, quotation checks, provenance, and coverage disclosures. Do not label saved examples as live or infer management credibility from quotation counts.
- Run relevant checks from the [development guide](docs/development.md). For deployment/configuration changes, verify both environments and follow [deployment](docs/deployment.md). Add SQL changes as new migrations; do not edit applied migrations.
- Keep this file concise. Put detailed guidance in the [documentation index](docs/README.md), and update the relevant guide when behavior changes.
