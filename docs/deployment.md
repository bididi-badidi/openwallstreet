# Deployment

GitHub repository: [bididi-badidi/openwallstreet](https://github.com/bididi-badidi/openwallstreet).

The [CI workflow](../.github/workflows/ci.yml) checks every pull request into `main` and every push to `main`. It can also be run manually on a trusted repository branch. Required checks are web validation, Python tests, repository hygiene, and a full-history secret scan. The `Ready` job succeeds only when all of them pass.

## Release behavior

| Trigger | Behavior |
| --- | --- |
| Pull request into `main` | Credential-free checks; no deployment |
| Push to `main` | Checks, then production deployment if enabled |
| Manual CI run, preview selected | Checks, then shared preview deployment if enabled |
| Manual CI run, production selected | Checks, then production deployment only from `main` |

Deployments are disabled until the repository variable `DEPLOYMENTS_ENABLED` is `true`. Checks still run when deployment is disabled. Each environment serializes its deployments without interrupting a deployment already in progress. A shared preview contains one selected branch at a time.

## One-time GitHub configuration

Create GitHub environments named `production` and `preview` before enabling deployment. Restrict production to `main`. Allow preview only from trusted repository branches, for example `main`, `feat/*`, `fix/*`, `docs/*`, and `chore/*`. Do not deploy fork code with secrets. Configure main branch protection as described in [development](development.md#branching).

Set these separately on each environment:

| Setting | Kind | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Scoped token for the deployment account |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Target Cloudflare account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | Variable | That environment's D1 database ID |
| `DEPLOY_URL` | Variable | HTTPS origin of the deployed web Worker, with no path |

Use a scoped token with permissions needed to deploy Workers/assets, manage the Workflow, and apply D1 migrations. Restrict it to the intended account. Add other permissions only if the deployment configuration requires them. Do not use a global API key. Runtime Nebius/Tavily credentials belong in Cloudflare Worker secrets, not GitHub build variables.

Production uses the existing `wallstreet-leadership` and `wallstreet-research` names. The production account/database IDs in Wrangler describe the current installation; CI supplies the environment's IDs and validates their shape before deployment. Keep those checked-in production IDs current, especially when moving accounts, because preview isolation checks compare against them.

Preview uses `wallstreet-leadership-preview`, `wallstreet-research-preview`, and `wallstreet-research-workflow-preview`. Create its D1 database once:

```sh
cd src/web
npx wrangler d1 create wallstreet-research-preview
```

Put the returned ID in the preview GitHub environment variable. The checked-in all-zero preview ID is deliberately unusable for deployment. The configuration step rejects both that placeholder and the production database ID. Dry runs and local tests do not require a remote database.

## Provision runtime secrets

Provision secrets once in each target account/environment before the first automated deployment. The service token must match between the two Workers in the same environment, and should differ between preview and production.

| Worker | Required secrets |
| --- | --- |
| Web | `NEBIUS_JOB_SERVICE_TOKEN`, `RESEARCH_ACCESS_CODE` |
| Research | `NEBIUS_JOB_SERVICE_TOKEN`, `NEBIUS_API_KEY`, `TAVILY_API_KEY` |

Use Wrangler's interactive secret prompts or the Cloudflare dashboard. For example, from `src/web`:

```sh
# Repeat for each required name; provide the value at the prompt.
npx wrangler secret put NEBIUS_JOB_SERVICE_TOKEN --config research/wrangler.jsonc --env preview
npx wrangler secret put NEBIUS_JOB_SERVICE_TOKEN --config wrangler.jsonc --env preview
```

Omit `--env preview` for the existing production Workers. The local `scripts/cloudflare-secrets.py` helper targets production only; do not use it to prepare preview. Preview has lower job limits and no email binding, so it cannot send real contact email. Production contact delivery retains the existing Cloudflare sender/recipient configuration.

Once both environments and runtime secrets are ready, enable `DEPLOYMENTS_ENABLED`, run a preview deployment, and inspect its checks before relying on automatic production releases. If only production is configured, leave preview undispatched until its database and secrets exist.

## Build and deployment order

1. Run all CI checks on the exact commit being deployed.
2. Validate the target account and database configuration.
3. Build the frontend for the selected environment and verify its generated Worker name, account, and service binding.
4. Apply pending D1 migrations to the selected database.
5. Deploy the research Worker/Workflow, then the web Worker.
6. Check the homepage, Microsoft saved example, and unauthenticated report rejection. These smoke checks make no paid research calls and send no email.

The frontend environment is selected **at build time** using `CLOUDFLARE_ENV=preview` (`npm run build:preview`). Deploy its generated `dist/server/wrangler.json` without adding another environment flag. The research Worker uses its source configuration with `--env preview`. See [Cloudflare's Vite environment guide](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).

CI records the deployed commit and target URL in the run summary. A successful smoke check establishes basic availability and the tested access boundary, not complete provider health. Test a real research job separately when preparing a release, with an explicit credit budget.

## Database changes

All backend schema changes live in `src/web/research/migrations/`. The first two migrations preserve the existing research and reception schemas and use `IF NOT EXISTS`, allowing the current manually initialized installation to adopt migration tracking without deleting its rows. Back up and check the existing schema before first production adoption; `IF NOT EXISTS` does not repair a divergent table definition.

For new changes, add a numbered migration using Wrangler:

```sh
cd src/web
npx wrangler d1 migrations create DB add_example_column --config research/wrangler.jsonc
npx wrangler d1 migrations apply DB --local --config research/wrangler.jsonc
```

Never edit a migration that has been applied remotely. Prefer additive changes compatible with the previous Worker version and in-flight Workflow instances. Add tests for changes affecting data or constraints. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## Recovery and submission freeze

Keep the last known working commit and deployment IDs. If a release fails, inspect which step failed: a completed migration or research deployment remains applied even when a later step fails.

Prefer a revert pull request followed by the usual checked deployment. For urgent recovery, Cloudflare Worker rollback can restore the previous code versions, but it does not roll back D1 schema/data. Restore compatible web and research versions together when their contract changed. Use D1 recovery only as a deliberate database operation, after considering writes since the restore point.

For the submission, tag the accepted commit and set `DEPLOYMENTS_ENABLED` to `false` while preserving the running deployment. Continue development on feature branches, or use a separately configured deployment if preview is needed during the freeze. Do not silently change the judged application.

GitHub environment settings and secrets are external configuration; workflow files alone do not create them. See [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
