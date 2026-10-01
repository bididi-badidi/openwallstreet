# Five-year stakeholder view

The collector keeps source documents and extraction records. The ledger records economic identity, dates, revisions, comparisons and review history. The presentation compiler produces a small, replaceable view over that ledger. It makes no model calls and does not rewrite collected evidence.

A selection file chooses at most 20 milestones over five completed fiscal years. Each milestone names existing ledger entries, one supported date anchor, a reason for inclusion, concise copy and an explicit limitation. Entries sharing a month are presented together rather than assigned invented event days. Annual measurements use their period-end month for layout and retain the full-year label. An annual report's publication date is never silently used as an event or statement date.

Four assessment dimensions remain separate: delivery credibility, disclosure and accountability, operating efficiency, and capital stewardship. All presentation interpretations remain proposed, even if their underlying ledger entries have been reviewed. There is no personal honesty rating or universal management score.

## Build the current Alphabet view

From the repository root:

```sh
PYTHONPATH=src python3 -m credibility.presentation \
  --curation src/credibility/examples/alphabet-ledger-five-year-v2.json \
  --selection src/credibility/examples/alphabet-five-year-presentation.json \
  --as-of 2026-09-30 \
  --previous data/derived/alphabet-ledger-v1/ledger.json \
  --output src/leadership-ui/evidence-model.json
```

The compiler first revalidates evidence hashes, source bytes, quote presence and append-only ledger history. It then rejects missing references, rejected or unavailable entries, mixed assessment dimensions, unsupported date anchors, duplicate month anchors and dates outside the requested window. It separately labels and counts offline source-review supplements, deduplicating physical reports by source hash and period. It retains full saved source pages for table headers, date and attribution support, contrary evidence and all selected records' date roles.

Coverage is calculated from saved annual documents, accepted quotations and processed chunks. “Collected; review pending” means every document chunk was processed and at least one quotation survived; it does not mean exhaustive claim extraction or semantic approval. Rejected quotation counts, uncertain publication metadata and other collection gaps remain accessible. A missing-year warning appears beside the timeline.

The remaining FY2024 extraction review is in `docs/archive/alphabet/reviews/remaining-claims.json`. It is an inventory of proposed groups, not automatically approved ledger entries. Compound claims still require splitting before numeric matching. The selection reviews for earlier years and FY2025 similarly document candidate choices; source-linked ledger entries are the input to the actual presentation.

## Selection discipline

Keep economically distinct authorizations, amounts spent and investment returns separate. Group repeated descriptions of the same commitment, retaining every quotation. Do not merge annual targets merely because their topic is the same. Material setbacks, revisions and unresolved outcomes belong beside favorable results. An absent matched outcome means unknown, not missed.

The annual-source baseline does not recover every quarterly guidance revision. A complete delivery judgment may need original announcements, earnings materials, revised definitions, accounting bridges and independent outcome corroboration. Preserve an original commitment even when later guidance or a differently defined outcome is found.
