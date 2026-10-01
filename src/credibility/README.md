# Management evidence collection

A configurable stage-one research system for primary annual and quarterly reports. It locates MD&A, highlights, management promises, forecasts, aspirations, facts and challenges, and saves source-backed structured evidence. The collector does not score credibility or judge delivery/resolution. A separate [offline promise-to-outcome ledger](LEDGER.md) now curates saved evidence, preserves economic statement/version history, and compares explicitly reviewed compatible targets and outcomes. It produces JSON, Markdown and a standalone HTML review page without model calls.

## Run

Requires Python 3.10+ and `pdftotext` for PDFs. No Python dependencies are required. The default engine uses authenticated Codex CLI with custom permission-profile support (tested with 0.146.0). The alternative Nebius engine uses API keys and does not require Codex. Run from the repository root:

```sh
PYTHONPATH=src python3 -m credibility --probe
PYTHONPATH=src python3 -m credibility --config src/credibility/examples/live-smoke.json --output data/new-live-run
PYTHONPATH=src python3 -m credibility.archive --output data/magnificent-seven --batch-size 1
```

Each output directory for a single run must be new. Archive runs reuse their directory and resume from checkpoints. Increase `--batch-size` deliberately; it ranges from 1 to 40. Use `--retry-partial` for incomplete archive jobs. A partial single run exits 2 while retaining evidence.

The live example requests Alphabet's 2024 annual report, using its issuer-linked PDF. SEC can return HTTP 403 even for a valid filing; an issuer-hosted or issuer-linked copy is a suitable primary source. Configure exact primary hostnames, including any issuer-linked CDN. A URL ending in PDF that returns HTML is rejected.

The deterministic fictional example needs no model or network:

```sh
PYTHONPATH=src python3 -m credibility --config src/credibility/examples/fictional.json --output /tmp/new-fictional-run --fixture
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

Optionally install with `python3 -m pip install -e .` and use `management-evidence` / `management-archive` instead of the module invocations.

## Sandboxing

The CLI engine generates a custom `management-research` permission profile for every job. It denies `:root`, grants `:minimal` runtime reads, permits only that job's `inputs/` as read-only and `work/` and `outputs/` as writable. It does not combine permission profiles with legacy `--sandbox` or `sandbox_mode` settings. User configuration and exec-policy rules are excluded from model execution so they cannot broaden the generated profile. Agent shell environments contain only a minimal system PATH, a job-local HOME and TMPDIR. Credentials stay with the trusted Codex host process and are not passed into the agent shell environment.

Before **every** model call, an actual sandbox subprocess tests allowed input reads and work/output writes, denied input writes and sibling reads/writes, and a denied symlink escape. The identical profile arguments are then used for live `codex exec`. Failed verification prevents model dispatch. Evidence is written to each worker's `outputs/sandbox-verification.json`.

```sh
PYTHONPATH=src python3 -m credibility.permissions --output data/new-permission-check
```

macOS cannot create the nested sandbox from inside the desktop tool sandbox. The coordinator must start from a normal terminal or an explicitly authorized external process context; **the inner agent sandbox remains enabled**. No full-access agent mode or bypass flag is used. A sandbox launch failure is a host-context problem, not permission-test success. Minimal runtime access includes system tools and libraries; it does not mean literally every file outside the three directories is unreadable. Homebrew Python was correctly blocked during testing, so permission probes use the permitted system shell.

Agent command networking is disabled. Hosted web search and Codex service traffic are separate from command networking. The trusted coordinator downloads primary reports through exact HTTPS host validation, with redirects checked and non-public addresses rejected. MCP and user integrations are not configured by this engine. This is not a hardened hostile-network crawler; DNS rebinding protections are not implemented.

Official references: [permission profiles](https://learn.chatgpt.com/docs/permissions) and [sandbox command](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

## Architecture and engines

Application code is in `src/credibility`; tests are in `tests`. `engine.py` defines the provider-neutral `Engine`, `EngineConfig`, `EngineRequest`, `EngineResult` and `AgentDirectories` types. The coordinator has no Codex subprocess dependency. `runtime.py` implements the CLI adapter and fixes its model to **gpt-5.6-luna / xhigh**, rejecting substitutions.

`nebius_runtime.py` implements the API adapter, `api_transport.py` handles bounded HTTPS requests and sanitized failures, and `engine_factory.py` selects either engine using arguments and environment configuration. Both single-run and archive entry points accept `--engine`. Tests inject a transport to verify tool conversations, failure handling and concurrent worker isolation without credentials or network access. See [Nebius setup](NEBIUS.md) for configuration and commands.

## Evidence and failure handling

`evidence.json` contains aggregate documents, claims and job gaps. `job-N.json` checkpoints completed workers. Each worker preserves raw source bytes, SHA-256 hashes, numbered text snapshots, discovery responses, extraction responses and execution provenance. Documents retain identity, original/final URLs, fiscal year, period end, publication date when known and retrieval time. Claims retain exact quotations, page/section, classification, highlights, numeric targets and units, verbatim target dates, attribution and uncertainties.

PDF pages are 1-based physical pages, not printed folios. HTML has one synthetic page and needs a section locator. Source text is split into bounded chunks without renumbering pages; the default maximum is eight chunks per document. Excess coverage is explicitly flagged. Scanned PDFs requiring OCR are not supported. Documents are capped at 25 MB; each model call has a ten-minute timeout.

PDFs use reading-order text to avoid interleaving columns. Whitespace-only matching maps a model quotation back to an exact source span; words and punctuation are not changed. The original model quotation is retained when spacing differs. A claim is accepted only when its saved exact excerpt appears on the cited source page in the supplied chunk. This confirms quotation presence, not factual truth or semantic correctness. Document metadata and interpretation are agent-reported and require review. Unknown dates stay null. Deduplication is conservative: content/type/period identities and identical structured claims merge; revised targets and differing excerpts remain separate.

Up to eight report workers run concurrently, with a default of three. Failed workers do not discard other workers' results. Completed chunks are retained if a later chunk fails. Model notes about chunk boundaries and deferred analysis are preserved as extraction notes rather than mislabeled as retrieval failures. Archive batches preserve attempts and skip previously collected jobs, use a process lock, and requeue interrupted running jobs. Historical inventory coverage always needs review; extraction success does not prove every expected filing was found.

## Historical scope

`examples/magnificent-seven.json` configures Apple, Microsoft, Alphabet/Google, Amazon, NVIDIA, Meta/Facebook and Tesla, from 2000 onward. GOOG/GOOGL share one issuer. Historical names and primary-source listing references are retained. Fiscal 2027 is included as of 2026-09-30 to capture issuers whose fiscal names run ahead of calendar years, without assuming future reports exist.

The initial manifest contains 392 **planning slots**, one per issuer/fiscal-year/report-type, not 392 reports. Of these, 52 are pre-listing slots and 340 need research. Pre-listing means listed-company periodic reports were not expected; registration statements may still contain useful historical financials and MD&A. Optional registration evidence is not yet collected. Listing-year quarters, unpublished current periods and quarter completeness need source review, not automatic missing-report labels.

## Ledger and presentation stages

The [offline ledger](LEDGER.md) is implemented as a derived, versioned layer; it does not replace this collector or its selected runtime engine. It handles explicit promise/outcome matches, preserves originals and revisions, separates date roles and canonical metrics, and keeps unknowns and semantic review states visible. The saved Alphabet example fixes selected duplicate/classification/date issues while leaving uncurated claims unresolved. No universal trust score or personal honesty inference is produced.

An existing [React/Motion leadership prototype](../leadership-ui/README.md) presents selected Alphabet events. It remains a separate curated historical UI, not a live ledger feed. Automated synthesis, challenge resolution, verified director contributions/tenure, geographic operations mapping and broad historical collection remain future work.

## Verified live result

The saved run at `data/live-alphabet-2024/` completed all three extraction chunks of Alphabet's 2024 annual report using Luna 5.6 with extra high reasoning. It contains 84 source-verified claims: 39 reported facts, 6 measurable promises, 8 aspirations, 15 forecasts and 16 challenges. Six candidate quotations were rejected, so the run is honestly marked partial. `findings.md` is the readable artifact; `verification-summary.json` records the checks.

The initial run exposed PDF column interleaving. The parser now uses reading order. Saved responses were revalidated against the unchanged PDF without repeating model calls; original text and evidence were retained. Whitespace-aligned source spans, one uniquely corrected page reference, and any layout-specific table text remain explicitly auditable. `revalidate.py` is a one-time saved-run correction tool, not a model inference stage.

`data/live-discovery-unseeded/` separately proves discovery without a supplied report URL, including recorded live web-search events. `data/magnificent-seven/coverage.json` now records 339 pending planning slots, 52 pre-listing slots and one partial collected slot. The full archive is not complete. Resume a bounded batch from a normal terminal with:

```sh
PYTHONPATH=src python3 -m credibility.archive --output data/magnificent-seven --batch-size 1
```

The offline test suite covers the source parser, citation validation, sandbox fail-closed behavior, profile parity, exact runtime model settings, archive behavior and the ledger's identity/date/comparability regressions. The repository-wide checker has previously reported three missing source skills in the meeting-prep plugin, unrelated to this application; run it to see current results.

## Five-year presentation

The [presentation compiler](PRESENTATION.md) builds the stakeholder timeline from verified ledger entries and explicit milestone selections. Coverage, original date precision, citations and proposed review status remain visible; it does not run models or replace the collector.
