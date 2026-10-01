# OpenWallstreet

Source-backed research into what company management put on record. Explore annual-report statements, inspect exact quotations, and download the supporting evidence.

[Live application](https://wallstreet-leadership.zishenchan.workers.dev) | [Documentation](docs/README.md) | [Development](docs/development.md) | [Deployment](docs/deployment.md)

## What it does

- Researches annual reports for Apple, Microsoft, Alphabet, Amazon, NVIDIA, Meta, and Tesla.
- Uses NVIDIA Nemotron through Nebius Token Factory for discovery and structured extraction, with Tavily search.
- Runs durable research jobs on Cloudflare Workflows, with private results and evidence stored in D1.
- Shows source-linked statements and coverage gaps alongside clearly labeled saved examples.

Live research is an evidence inventory, not an investment recommendation or a management credibility score. Exact quotation matching does not establish semantic correctness or promise fulfillment. The separate Python collector and reviewed ledger support more extensive offline workflows.

## Start locally

Use the Node version in `.node-version` and npm 11.12.1:

```sh
cd src/web
npm ci
npm run dev
```

Saved examples work without paid provider credentials. Live research and reception need the backend and Worker secrets; follow the [development guide](docs/development.md). To check the application:

```sh
cd src/web
npm run check
```

The Python test suite uses Python 3.12 in CI:

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
python3 scripts/check-repository.py
```

## Repository

| Path | Purpose |
| --- | --- |
| `src/web/` | Deployed website, research Worker, reception service, tests, and database migrations |
| `src/credibility/` | Python evidence collector, ledger, and presentation compiler |
| `src/leadership-ui/` | Original curated presentation and evidence model |
| `tests/` | Python tests |
| `scripts/` | Repository tooling |
| `docs/` | Current guides, plans, and clearly separated historical material |

See [repository layout](docs/repository-layout.md) for ownership and placement rules. Agent instructions live in [AGENTS.md](AGENTS.md).

## Contributing and releases

Use short-lived feature branches and pull requests into `main`. CI checks the web app, Python collector, repository hygiene, and secrets. Passing `main` commits deploy after repository deployment settings are enabled. Preview is a separate environment, not a long-lived branch. See [branching](docs/development.md#branching) and [deployment setup](docs/deployment.md).

## Attribution and license

This project builds on the [Anthropic financial-services reference repository](https://github.com/anthropics/financial-services). Its original overview is preserved in the [upstream archive](docs/archive/upstream/financial-services.md). The current application and research pipeline are documented separately from that reference library.

[Apache License 2.0](LICENSE). Preserve inherited license and attribution notices when reusing material.
