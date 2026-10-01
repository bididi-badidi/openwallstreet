# Development

## Prerequisites and setup

Use Node 26.0.0 (`.node-version`), npm 11.12.1, and Python 3.12. Application dependencies are pinned in `src/web/package-lock.json`.

```sh
cd src/web
npm ci
npm run dev
```

For saved examples, no provider keys are needed. For live research, copy `src/web/.dev.vars.example` to `src/web/.dev.vars` and `src/web/research/.dev.vars.example` to `src/web/research/.dev.vars`. Supply real credentials only in these ignored files. Use the same `NEBIUS_JOB_SERVICE_TOKEN` in both files. Set a local owner access code in the frontend file.

Initialize local storage from `src/web`, then run the backend and frontend in separate terminals:

```sh
npx wrangler d1 migrations apply DB --local --config research/wrangler.jsonc
npm run research:dev
# In a second terminal, also in src/web:
npm run dev
```

Local service bindings connect the two running Workers. Real Nebius/Tavily calls consume credits. Automated tests use deterministic provider responses. Email delivery needs additional Cloudflare setup and is not required for local research.

## Checks

From `src/web`, `npm run check` generates binding types, checks TypeScript, runs unit and real Workflows/D1 tests, builds the application, and validates the frontend deployment bundle. Run narrower checks while editing, then the complete relevant checks before a pull request.

From the repository root:

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
python3 scripts/check-repository.py
```

If Wrangler regenerates tracked binding declarations, include intentional changes. Do not hand-edit them. Changes to either Wrangler environment must also pass `npm run build:preview` and the preview deployment dry run described in CI.

## Branching

- Keep `main` releasable. Use `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>` branches.
- Start from current `main`; keep one coherent change per branch and pull request. Preserve other people's uncommitted work.
- Push the feature branch and open a pull request. Require the `Ready` check before merging. Prefer squash merges, then delete merged branches.
- Update a branch from `main` before merging when needed. Never force-push `main`. If rebasing your own shared branch is necessary, coordinate first and use `--force-with-lease`.
- Preview is an isolated deployment environment. A permanent `dev` or `preview` branch is not part of this workflow.
- Only trusted repository branches may be manually deployed to preview. Fork pull requests run checks without deployment secrets.
- Tag the accepted hackathon release, for example `submission-v1`. Keep the judged deployment stable and develop later changes separately during judging.

Set GitHub's default branch to `main`. Protect it with required pull requests, the `Ready` status check, resolved conversations, and blocked deletion/force pushes. Add reviewer requirements when the team size makes them practical. CI files do not configure branch protection automatically.

See [repository layout](repository-layout.md) for file-placement rules and [deployment](deployment.md) for release operations.
