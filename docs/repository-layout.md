# Repository layout and hygiene

Keep the current `src/` layout stable. Moving application code into `apps/` would add import and tooling churn without helping this release.

```text
AGENTS.md                  concise agent entry point
README.md                  product and quick start
.github/workflows/         active application CI/CD only
src/web/                   deployed application
  app/                     routes and public API
  components/              UI
  lib/                     shared contracts and adapters
  research/                private Worker and durable workflow
    migrations/            ordered D1 migrations for all backend tables
  reception/               reception service
  data/                    small curated public examples and schemas
  public/                  intentionally public assets and evidence examples
  scripts/                 application tooling
  tests/                   application tests
  qa/                      curated visual verification records
src/credibility/           Python collector and offline evidence tooling
src/leadership-ui/         original presentation and compiler inputs
scripts/                   repository-level tooling
  upstream/                inherited reference-library maintenance tools
tests/                    Python tests (at repository root)
docs/
  README.md                navigation index
  architecture.md          current system responsibilities
  development.md           local setup and branching
  deployment.md            operational guide
  repository-layout.md     this policy
  plans/                   proposals, explicitly marked as such
  archive/                 historical reports and machine-readable reviews
  assets/                  documentation images referenced by a guide
data/                     ignored local research outputs; README is versioned
artifacts/                ignored scratch exports and temporary outputs
```

## Placement rules

- Keep the repository root for entry points and tool configuration. Put scratch spreadsheets, exports, and temporary files in ignored `artifacts/`.
- Keep `docs/` top-level content limited to the five current guides above. Add a section to an existing guide before creating another one. If a new guide is necessary, update the index and hygiene checker deliberately.
- Put dated investigations and completed plans in `docs/archive/<topic>/`; put pending proposals in `docs/plans/`. Archives are historical evidence, not authoritative current behavior.
- Keep JSON review inventories in the relevant archive's `reviews/` directory. Never scatter them next to current guides.
- Keep test fixtures next to their owning tests, and curated app examples in `src/web/data/` or `public/`. Do not promote raw provider responses, private evidence, or entire run folders into public examples.
- Raw collection runs belong in ignored `data/`. Preserve originals; do not silently rewrite evidence while organizing files.
- Do not commit `.env*`, `.dev.vars*`, dependencies, build outputs, runtime state, logs, or temporary credentials. Only placeholder `*.example` files may be committed for secrets configuration.
- Generated binding declarations and intentionally published sample evidence are tracked exceptions. Generated runtime outputs are not.
- Update incoming and outgoing relative links whenever moving a Markdown file. Run the repository hygiene check before committing.
- Do not use `git add .` or `git add -A` on a workspace with unrelated local material. Stage explicit task paths and inspect the staged diff.

## Inherited local material

The workspace also contains the original `plugins/`, `managed-agent-cookbooks/`, and Microsoft 365 installation references, plus local assistant configuration. These are not required by the deployed application and are excluded from routine publication through `.gitignore`. Existing local copies are retained. Their original overview and inactive workflows are archived for provenance.

Inherited maintenance scripts live under `scripts/upstream/` and are archival, not application CI. If those references become a maintained product feature, define their ownership, license inventory, and checks before explicitly adding them to the repository. Preserve the root license and attribution notices.
