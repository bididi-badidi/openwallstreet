# Promise-to-outcome ledger

The ledger is a separate, deterministic stage over saved collector evidence. It makes no model or network calls. It never edits collected reports, quotations, metadata, archive checkpoints, or the Luna runtime. Its inputs are pinned evidence packs plus an explicit curation JSON file; its outputs are a new `ledger.json`, `ledger.md` and a self-contained `ledger.html` review page.

## Try the saved Alphabet example

From the repository root, with Python 3.10 or later:

```sh
PYTHONPATH=src python3 -m credibility.ledger \
  --curation src/credibility/examples/alphabet-ledger-v1.json \
  --as-of 2026-09-30 \
  --output data/derived/alphabet-ledger-v1
```

Open `data/derived/alphabet-ledger-v1/ledger.html` in a browser. No server, JavaScript, API credentials or paid inference is needed. The CLI refuses an existing output directory; use a new version directory for another run. `management-ledger` is also available after an editable package install. The example's relative evidence path assumes this repository layout; a packaged installation does not bundle the saved research data.

The curated example contains 13 economic statements supported by 18 of the 84 extraction records. All 84 original claims remain in the citation register; the other 66 stay in an uncurated queue. All example interpretations have **proposed / automated** review status. The snapshot has six rejected quotations and incomplete historical coverage. No new current-company research was performed.

The three specific corrections are:

| Issue | Derived treatment |
| --- | --- |
| Dividend intention extracted as two measurable promises and one aspiration | One `conditional_intention`, three original claim references, retained original classifications, explicit grouping rationale and board-approval condition. No delivery denominator or corroboration count. |
| Mixed statement, event, deadline and period dates | Independent fields with evidence references and precision. April 2024 authorization is an event; June 2024 is the first-dividend event; FY2024 is a measurement period; the CEO letter statement is April 2025. Unknown first-disclosure dates stay null. |
| Metric labels and superficially similar numbers | Explicit canonical metric definitions, units, accounting basis, scope and measurement basis. Capex's raw `unit: capital expenditures` is preserved; its curated unit is USD billion and its unresolved accounting basis stays null. Authorization capacity and cash repurchases cannot match. |

The sample also groups duplicate headcount and cash-distribution records, separates contractual obligations from discretionary promises, and retains the operating-margin table's supplied-layout snapshot and full page headers. Claim 25's unsupported ruling summary stays uncurated; the legal event uses claim 71, whose quotation supplies the ruling and date.

## Contract and curation workflow

`ledger_schema.py` is the strict version-one contract. Unknown fields, unknown references and incompatible schema versions fail rather than being silently dropped. Every schema field is required; unknown optional facts use JSON `null`, not an empty string or a guessed date. `examples/alphabet-ledger-v1.json` is a complete editable example.

1. Add each evidence pack to `sources` with a unique ID, path relative to the curation file, and SHA-256 of the exact `evidence.json` bytes. Packs must belong to the same configured issuer. Each pack needs its saved `.source` and text snapshots in the collector's existing layout. This supports multiple reports/runs without replacing the archive.
2. Define canonical metrics with an immutable ID and precise definition. Record unit (including currency and scale), accounting basis, entity/segment/geographic scope, and measurement basis (period total, ratio, point-in-time, etc.). Keep unknown dimensions null. If the definition or measurement convention changes, create a new metric ID. No fuzzy synonyms, FX conversion, unit conversion, adjusted-to-GAAP bridge or fiscal-period extrapolation runs automatically.
3. Add economic entries. `evidence_refs` use `source-id:original-claim-id`. An entry groups repeated mentions of one specific economic statement, with a mandatory rationale. A passage containing several different deliverables can support separate entries; the same words do not prove economic identity. The ledger does not infer semantic duplicates from matching quotations or numbers. Shared claim references are disclosed in coverage.
4. Normalize classification (`promise`, `conditional_intention`, `authorization`, `obligation`, `forecast`, `outcome`, `decision`, `challenge`, `context`). Preserve original wording/classification in the citation register. Assign one analytical dimension per entry: delivery credibility, disclosure/accountability, operating efficiency, or capital stewardship. These are separate evidence views, never averaged scores.
5. Supply normalized dates only with an explicit basis and source references. `statement` is when the specific statement was made; `first_disclosure` is when this version was first publicly available. Neither inherits container publication, fiscal year-end or retrieval time. `event` can be an authorization or first payment; `completion` specifically means completion of the measured deliverable. A generic event must not become completion. `target_deadline` is a promised endpoint; `measurement_period` gives the full actual/target interval. Year and month dates retain precision; comparison uses uncertainty bounds, not invented occurrence days. Quarter/relative dates require reviewed exact measurement boundaries or remain unknown with the raw text preserved.
6. Keep attribution explicit. `outcome_entity` is the company; `statement_by`, `decision_by`, and optional individuals describe who is actually cited. Individual records carry a role, optional tenure bounds, relationship (`statement`, `decision`, `documented_contribution`, `tenure_context`), evidence and rationale. Unknown tenure remains null. An outcome during tenure is context and never automatically becomes that person's contribution.
7. Propose a match by naming exact promise and outcome version IDs and writing a rationale. Supply contrary evidence and limitations even for a tempting rejected association. The engine retains every gate result. Semantic approval is recorded by appending to `review_history`; quote verification alone never sets `reviewed`. Automated and human reviewers are displayed distinctly. Review status is an assertion by its author, not authenticated sign-off or proof of truth.

The tool verifies the evidence JSON hash, original source hash and exact quotation on the cited saved page. It selects a claim's `quote_snapshot` before falling back to the document snapshot. The output preserves the original claim, document, parser corrections, snapshot hash, extraction method and full source page. This verifies citation presence and provenance, not whether an interpretation is correct. The parser snapshot is derived text, not a cryptographic proof that the PDF contains a particular meaning; historical continuation also checks that previously used text snapshots have not changed.

## Matching and statuses

A numeric comparison requires all of the following:

- A `promise` and an `outcome`, with explicit reviewed entries and reviewed matching rationale.
- The same canonical metric ID, with non-null matching definition, unit, accounting basis, scope and measurement basis.
- Identical measurement start and end, the same outcome entity, and a promise predating completion. Outcomes must be disclosed after their measurement period and on/before the assessment cutoff. The period must have ended.
- A normalized target and point outcome. Decimal strings avoid binary rounding. Operators are `eq`, `gte`, `lte`, `range`, and `approximate`; approximation requires an explicitly reviewed tolerance in the same unit. The ledger never invents a tolerance.
- No unresolved conditions or contrary evidence. These block an automatic delivery verdict. Removing a caveat requires a new evidence-backed version, not an edit to a historical entry.

`achieved`, `achieved_late`, or `missed` describes only the normalized target. Meeting a capital spending plan does not establish good returns. A deadline also requires an explicit completion date: period-end or first payment is not substituted. Imprecise dates that straddle a deadline produce `unresolved`; exact day-to-day elapsed time is emitted only when both statement and completion days are known. Partial quantitative delivery below a threshold is a missed threshold; a separate qualitative `partly achieved` judgment, weighted multi-part targets, challenge resolution, and benefit/ROI assessment are not implemented.

`outcome_not_found` means this pack lacks a proposed result, even when the target period has passed. `not_yet_due` requires supported timing and a promise already disclosed by the cutoff. `not_comparable` retains failed metric/time gates; `needs_review` blocks an otherwise comparable match; `unresolved` retains conflicting results, restatements, or contrary evidence. `not_a_delivery_promise` protects intentions, authorizations and other non-promises. `withdrawn` records an explicitly reviewed withdrawal without converting it to a miss. `not_available_as_of` prevents a later promise from being presented as known at an earlier cutoff.

All candidates remain visible. Conflicting outcomes are not selected by majority vote or best result, even when both exceed the target. The cutoff governs evidence availability, not collection completeness. Curation/review history is shown as recorded now; this is not a reconstruction of which analysts had approved a view on a historical date. Source citations and future-version records remain inspectable even when ineligible for the cutoff.

## Revisions and continued research

Keep an entry's ID and economic ID stable. Append a new entry with the same economic ID, a new version ID, `change: revision` (or reaffirmation/progress/withdrawal), and `supersedes` pointing to the prior version. The chain must have exactly one original, unambiguous chronological statement dates and no branches. The original target retains its own outcome comparison. A lower revised goal cannot erase an original miss. Restated outcomes reopen old matches; a known future restatement cannot leak into an earlier cutoff.

When more evidence arrives, append its pinned source, new entries and matches, then build with continuity validation:

```sh
PYTHONPATH=src python3 -m credibility.ledger \
  --curation path/to/continued-curation.json \
  --previous data/derived/alphabet-ledger-v1/ledger.json \
  --as-of 2026-10-31 \
  --output data/derived/alphabet-ledger-v2
```

`--previous` forbids removal or rewriting of historical sources, metric definitions, entries or matches. Review histories can only append. It checks prior source-page snapshots and records the prior ledger's SHA-256. A build without `--previous` is an independent curation snapshot, not an enforced continuation. Correcting an erroneous interpretation whose historical statement date is itself unknown requires a separate curation snapshot with an explained audit trail; the tool will not fabricate chronological version dates to force it into a chain.

## UI boundary and checks

The generated HTML is the initial ledger review surface. It uses native disclosures, source links, escaped untrusted text and a restrictive content policy; it loads no scripts, fonts or remote assets. This keeps the ledger usable while the separate React/Motion leadership timeline remains a curated historical presentation. No ledger verdicts or ratings are injected into that timeline. A later UI can consume `ledger.json` and link exact entry/citation IDs without recalculating matching rules.

```sh
PYTHONPATH=src python3 -m unittest discover -s tests -v
python3 scripts/check-repository.py
```

Regressions cover the Alphabet curation's duplicate/date/table contracts, multiple outcome matching gates, revisions versus original goals, withdrawals, conflicting results, restatements, source cutoff leakage, approximate targets, unknown timing, immutable continuation, tampered evidence, source-page context, escaped HTML and output-directory refusal. They use synthetic inputs and source snapshots, including a [self-contained curation fixture](../../tests/fixtures/README.md); no test invokes paid model research. Real company evidence revalidation still requires the original local corpus.
