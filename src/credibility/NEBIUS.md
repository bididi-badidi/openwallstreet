# Nebius and Tavily engine

`NebiusRuntime` is a drop-in engine for the same concurrent discovery/extraction workers and resumable archive. It calls Nebius Token Factory for inference and gives discovery workers a bounded Tavily `web_search` tool. Extraction uses only the numbered source text already downloaded by the coordinator. Search snippets never bypass the existing primary-host, source-download or exact-quotation checks.

## Setup

Create `.env` in the repository root using [the template](../../.env.example), keeping any existing values. Set `NEBIUS_API_KEY` and `TAVILY_API_KEY`. The template selects `nvidia/nemotron-3-super-120b-a12b`, verified with a live probe on October 1, 2026. List the model IDs available in your Nebius account to choose another NVIDIA Nemotron model, and set `NEBIUS_MODEL` to its exact ID. The engine requires an explicit model setting and never substitutes another model or falls back to Codex.

```sh
PYTHONPATH=src python3 -m credibility --engine nebius --list-models
PYTHONPATH=src python3 -m credibility --engine nebius --probe
PYTHONPATH=src python3 -m credibility --engine nebius --config src/credibility/examples/live-smoke.json --output data/new-nebius-run
PYTHONPATH=src python3 -m credibility.archive --engine nebius --output data/nebius-archive --batch-size 1
```

The probe checks the exact model against `/models`, then exercises real tool calling, Tavily search and schema-constrained output. It uses API credits and returns exit code 2 if unavailable. A successful model listing alone does not verify tool or structured-output support. Single runs validate configuration before starting; archive batches run the full probe before dispatch. Each single-run output directory must be new. Archive runs reuse their directory and resume from checkpoints.

Set `CREDIBILITY_ENGINE=nebius` to make this the default, or pass `--engine codex` to select the original engine. `--env-file /path/to/file` selects another credential file. Existing process environment values override file values. The file reader supports single-line assignments, quoted values, comments and optional `export`; it does not expand variables, run shell commands or export keys into subprocess environments. Fixture runs, archive planning and recording existing runs need no credentials.

| Variable | Meaning | Default |
|---|---|---|
| `NEBIUS_API_KEY` | Nebius inference credential | Required |
| `TAVILY_API_KEY` | Tavily search credential | Required for discovery |
| `NEBIUS_MODEL` | Exact account model ID supporting tools and structured JSON | Required |
| `NEBIUS_BASE_URL` | HTTPS inference API base | `https://api.tokenfactory.nebius.com/v1` |
| `NEBIUS_TIMEOUT_SECONDS` | Shared deadline for each worker's model/search sequence | `600` |
| `NEBIUS_MAX_TOKENS` | Maximum output tokens per model request, including model reasoning | `16384` |
| `NEBIUS_MAX_SEARCH_CALLS` | Search call cap per discovery request | `4` |

Python applications can instantiate `NebiusRuntime(api_key=..., tavily_api_key=..., model=...)` and pass it to `Coordinator` or `archive.collect`, or use `create_engine('nebius', env_file=...)` from `credibility.engine_factory`. Never put keys into report configurations, prompts or source files.

## Evidence and execution

Each execution retains its prompt, schema, validated response, bounded search results, token usage and provider/model metadata. Truncated responses, malformed JSON, unsupported tool calls, excessive search batches and API errors fail the affected worker or chunk while the coordinator retains other completed evidence. At the search cap, tools are removed and the model must produce a final structured answer. Transient HTTP rate limits and server errors receive at most two retries within the deadline. Provider error bodies and credentials are not written to logs or evidence.

The API engine gives the model no filesystem or shell tools. Only prompts and supplied source chunks go to Nebius; search queries and configured domains go to Tavily. The trusted coordinator still retrieves reports and writes artifacts locally. This engine does not claim the CLI's subprocess sandbox verification. Reasoning metadata is `provider_default`, not Codex's `xhigh`.

This component runs the Python research workflow. The website uses a separate native Cloudflare Workflow implementation with Nebius, Tavily, and D1, as described in [the web README](../web/README.md). Its bounded three-year scope and evidence inventory do not claim parity with the Python archive and reviewed leadership ledger.

API references: [Nebius tool calling](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling), [Nebius structured JSON](https://docs.tokenfactory.nebius.com/ai-models-inference/json), [Tavily search](https://docs.tavily.com/documentation/api-reference/endpoint/search).

## Verification

On October 1, 2026, the live probe verified the model catalog, NVIDIA Nemotron 3 Super tool calling, one Tavily search and schema-constrained JSON output using the configured credentials. Offline tests also exercise the full concurrent collector using mocked API responses and fictional primary reports. A full live annual-report collection has not been repeated with Nebius as part of this change.
